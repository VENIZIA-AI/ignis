import { BaseHelper, getError } from '@venizia/ignis-helpers';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import * as ts from 'typescript';
import {
  ArtifactStereotypes,
  ArtifactTypes,
  type IScanOptions,
  type IScannedArtifact,
  type TArtifactType,
} from './common';

/** Finds exported classes carrying a stereotype decorator by reading the source, never by running it. */
export class ArtifactScanner extends BaseHelper {
  private static instance?: ArtifactScanner;

  private constructor() {
    super({ scope: ArtifactScanner.name });
  }

  static getInstance(): ArtifactScanner {
    return (this.instance ??= new ArtifactScanner());
  }

  scan(opts: IScanOptions): IScannedArtifact[] {
    const root = resolve(opts.root);
    const ignore = opts.ignore ?? ArtifactStereotypes.DEFAULT_IGNORE;

    const artifacts = this.listSourceFiles({ root, ignore }).flatMap(filePath =>
      this.scanFile({ filePath }),
    );

    return artifacts.sort(
      (a, b) => a.type.localeCompare(b.type) || a.className.localeCompare(b.className),
    );
  }

  private listSourceFiles(opts: { root: string; ignore: string[] }): string[] {
    const ignoreGlobs = opts.ignore.map(pattern => new Bun.Glob(pattern));
    const files: string[] = [];

    for (const relative of new Bun.Glob('**/*.ts').scanSync({ cwd: opts.root })) {
      if (relative.endsWith('.d.ts') || ignoreGlobs.some(glob => glob.match(relative))) {
        continue;
      }
      files.push(join(opts.root, relative));
    }

    return files.sort();
  }

  private scanFile(opts: { filePath: string }): IScannedArtifact[] {
    const { filePath } = opts;
    const source = ts.createSourceFile(
      filePath,
      readFileSync(filePath, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    );

    const stereotypeByLocalName = this.collectStereotypeImports({ source });
    if (stereotypeByLocalName.size === 0) {
      return [];
    }

    const exportedNames = this.collectExportClauseNames({ source });
    const found: IScannedArtifact[] = [];

    ts.forEachChild(source, node => {
      if (!ts.isClassDeclaration(node) || !node.name) {
        return;
      }

      const className = node.name.text;
      const types = this.artifactTypesOf({
        node,
        stereotypeByLocalName,
        filePath,
        className,
      });
      if (types.length === 0) {
        return;
      }
      if (types.length > 1) {
        throw getError({
          message: `[ArtifactScanner] ${filePath} | class ${className} carries ${types.length} stereotypes (${types.join(', ')}) - one class is one artifact`,
        });
      }

      const modifiers = ts.getModifiers(node) ?? [];
      const has = (kind: ts.SyntaxKind): boolean => modifiers.some(m => m.kind === kind);
      const isNamedExport =
        (has(ts.SyntaxKind.ExportKeyword) && !has(ts.SyntaxKind.DefaultKeyword)) ||
        exportedNames.has(className);
      const isAbstract = has(ts.SyntaxKind.AbstractKeyword);

      if (!isNamedExport || isAbstract) {
        this.logger
          .for('scanFile')
          .warn(
            'Skipped %s in %s | %s',
            className,
            filePath,
            isAbstract ? 'abstract' : 'not a named export',
          );
        return;
      }

      found.push({ className, filePath, type: types[0] });
    });

    return found;
  }

  /** local identifier -> stereotype name, for named imports from an IGNIS module (aliases resolved). */
  private collectStereotypeImports(opts: { source: ts.SourceFile }): Map<string, string> {
    const result = new Map<string, string>();

    for (const statement of opts.source.statements) {
      if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
        continue;
      }
      if (!ArtifactStereotypes.SOURCE_MODULES.test(statement.moduleSpecifier.text)) {
        continue;
      }

      const bindings = statement.importClause?.namedBindings;
      if (!bindings || !ts.isNamedImports(bindings)) {
        continue;
      }

      for (const element of bindings.elements) {
        const imported = (element.propertyName ?? element.name).text;
        const isStereotype =
          imported in ArtifactStereotypes.BY_DECORATOR ||
          imported === ArtifactStereotypes.ROOT_DECORATOR;
        if (isStereotype) {
          result.set(element.name.text, imported);
        }
      }
    }

    return result;
  }

  private collectExportClauseNames(opts: { source: ts.SourceFile }): Set<string> {
    const names = new Set<string>();

    for (const statement of opts.source.statements) {
      if (
        ts.isExportDeclaration(statement) &&
        statement.exportClause &&
        ts.isNamedExports(statement.exportClause)
      ) {
        for (const element of statement.exportClause.elements) {
          names.add((element.propertyName ?? element.name).text);
        }
      }
    }

    return names;
  }

  private artifactTypesOf(opts: {
    node: ts.ClassDeclaration;
    stereotypeByLocalName: Map<string, string>;
    filePath: string;
    className: string;
  }): TArtifactType[] {
    const { node, stereotypeByLocalName, filePath, className } = opts;
    const types: TArtifactType[] = [];

    for (const decorator of ts.getDecorators(node) ?? []) {
      const expression = decorator.expression;
      if (!ts.isCallExpression(expression) || !ts.isIdentifier(expression.expression)) {
        continue;
      }

      const stereotype = stereotypeByLocalName.get(expression.expression.text);
      if (!stereotype) {
        continue;
      }
      if (stereotype !== ArtifactStereotypes.ROOT_DECORATOR) {
        types.push(ArtifactStereotypes.BY_DECORATOR[stereotype]);
        continue;
      }

      const type = this.typeOfInjectableCall({ call: expression });
      if (!type) {
        this.logger
          .for('artifactTypesOf')
          .warn(
            'Skipped %s in %s | @injectable type is not a literal or ArtifactTypes.<NAME>',
            className,
            filePath,
          );
        continue;
      }
      types.push(type);
    }

    return types;
  }

  private typeOfInjectableCall(opts: { call: ts.CallExpression }): TArtifactType | undefined {
    const [argument] = opts.call.arguments;
    if (!argument || !ts.isObjectLiteralExpression(argument)) {
      return undefined;
    }

    const property = argument.properties.find(
      (entry): entry is ts.PropertyAssignment =>
        ts.isPropertyAssignment(entry) && ts.isIdentifier(entry.name) && entry.name.text === 'type',
    );
    if (!property) {
      return undefined;
    }

    const value = property.initializer;
    if (ts.isStringLiteral(value)) {
      return this.asArtifactType({ raw: value.text });
    }
    if (
      ts.isPropertyAccessExpression(value) &&
      ts.isIdentifier(value.expression) &&
      value.expression.text === 'ArtifactTypes'
    ) {
      return this.asArtifactType({ raw: value.name.text.toLowerCase() });
    }

    return undefined;
  }

  private asArtifactType(opts: { raw: string }): TArtifactType | undefined {
    const { raw } = opts;
    return ArtifactStereotypes.EMIT_ORDER.map(entry => entry.type)
      .concat(ArtifactTypes.MODEL)
      .find(type => type === raw);
  }
}
