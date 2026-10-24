import { BaseHelper, getError } from '@venizia/ignis-helpers';
import { globSync, readFileSync } from 'node:fs';
import { join, matchesGlob, resolve } from 'node:path';
import ts from 'typescript';
import {
  ArtifactStereotypes,
  ArtifactTypes,
  ScanSkipReasons,
  type IScanOptions,
  type IScanReport,
  type IScanSkipped,
  type IScannedArtifact,
  type TArtifactType,
} from './common';
import { StereotypeReexportResolver } from './reexport';

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
    return this.scanWithReport(opts).artifacts;
  }

  /** `scan` plus the decorated classes a caller's own `ignore` pattern hid - the generator prints them so a stale pattern cannot drop an artifact in silence. */
  scanWithReport(opts: IScanOptions): IScanReport {
    const root = resolve(opts.root);
    const { kept, hidden } = this.partitionSourceFiles({
      root,
      defaultGlobs: ArtifactStereotypes.DEFAULT_IGNORE,
      userGlobs: opts.ignore ?? [],
    });
    const sourceModules = new Set(opts.sourceModules);
    const resolver = opts.followReexports
      ? new StereotypeReexportResolver({ root, sourceModules })
      : undefined;
    const skipped: IScanSkipped[] = [];

    const artifacts = this.sortArtifacts(
      kept.flatMap((filePath) => this.scanFile({ filePath, sourceModules, resolver, skipped })),
    );
    const ignored = this.sortArtifacts(
      hidden.flatMap((filePath) => this.scanHiddenFile({ filePath, sourceModules, resolver })),
    );
    for (const artifact of ignored) {
      skipped.push({
        className: artifact.className,
        filePath: artifact.filePath,
        reason: ScanSkipReasons.IGNORED,
      });
    }

    return { artifacts, ignored, skipped };
  }

  /** A hidden file is only reported on, never a reason to fail: a scan error becomes one warning and the file contributes nothing. */
  private scanHiddenFile(opts: {
    filePath: string;
    sourceModules: Set<string>;
    resolver?: StereotypeReexportResolver;
  }): IScannedArtifact[] {
    try {
      return this.scanFile({ ...opts, isHidden: true });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.for('scanHiddenFile').warn('Skipped hidden file %s | %s', opts.filePath, reason);
      return [];
    }
  }

  private sortArtifacts(artifacts: IScannedArtifact[]): IScannedArtifact[] {
    return artifacts.sort(
      (a, b) => a.type.localeCompare(b.type) || a.className.localeCompare(b.className),
    );
  }

  /** `kept` feeds the index; `hidden` is what only a user pattern excluded (a default pattern wins, so tests and generated files are never reported). */
  private partitionSourceFiles(opts: {
    root: string;
    defaultGlobs: ReadonlyArray<string>;
    userGlobs: ReadonlyArray<string>;
  }): { kept: string[]; hidden: string[] } {
    const kept: string[] = [];
    const hidden: string[] = [];

    const sources = globSync(ArtifactStereotypes.SOURCE_GLOB, { cwd: opts.root });
    for (const relative of sources) {
      if (
        relative.endsWith('.d.ts') ||
        opts.defaultGlobs.some((pattern) => matchesGlob(relative, pattern))
      ) {
        continue;
      }
      const target = opts.userGlobs.some((pattern) => matchesGlob(relative, pattern))
        ? hidden
        : kept;
      target.push(join(opts.root, relative));
    }

    return { kept: kept.sort(), hidden: hidden.sort() };
  }

  private scanFile(opts: {
    filePath: string;
    sourceModules: Set<string>;
    resolver?: StereotypeReexportResolver;
    skipped?: IScanSkipped[];
    isHidden?: boolean;
  }): IScannedArtifact[] {
    const { filePath, sourceModules, resolver, skipped, isHidden = false } = opts;
    const source = ts.createSourceFile(
      filePath,
      readFileSync(filePath, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    );

    const stereotypeByLocalName = this.collectStereotypeImports({
      source,
      sourceModules,
      resolver,
    });
    if (stereotypeByLocalName.size === 0) {
      return [];
    }

    const exportedNames = this.collectExportClauseNames({ source });
    const found: IScannedArtifact[] = [];

    ts.forEachChild(source, (node) => {
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
      const has = (kind: ts.SyntaxKind): boolean => modifiers.some((m) => m.kind === kind);
      const isNamedExport =
        (has(ts.SyntaxKind.ExportKeyword) && !has(ts.SyntaxKind.DefaultKeyword)) ||
        exportedNames.has(className);
      const isAbstract = has(ts.SyntaxKind.AbstractKeyword);

      if (!isNamedExport || isAbstract) {
        if (!isHidden) {
          skipped?.push({
            className,
            filePath,
            reason: isAbstract ? ScanSkipReasons.ABSTRACT : ScanSkipReasons.NOT_EXPORTED,
          });
          this.logger
            .for('scanFile')
            .warn(
              'Skipped %s in %s | %s',
              className,
              filePath,
              isAbstract ? 'abstract' : 'not a named export',
            );
        }
        return;
      }

      found.push({ className, filePath, type: types[0] });
    });

    return found;
  }

  /** local identifier -> stereotype name, for named imports from an IGNIS module or a caller-named source module (aliases resolved). */
  private collectStereotypeImports(opts: {
    source: ts.SourceFile;
    sourceModules: Set<string>;
    resolver?: StereotypeReexportResolver;
  }): Map<string, string> {
    const result = new Map<string, string>();
    // Only a name a class actually wears as a decorator is worth following through re-exports.
    const decoratorNames = opts.resolver
      ? this.collectClassDecoratorNames({ source: opts.source })
      : new Set<string>();

    for (const statement of opts.source.statements) {
      if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
        continue;
      }
      const specifier = statement.moduleSpecifier.text;
      const isSourceModule =
        ArtifactStereotypes.SOURCE_MODULES.test(specifier) || opts.sourceModules.has(specifier);
      if (!isSourceModule && !opts.resolver) {
        continue;
      }

      const bindings = statement.importClause?.namedBindings;
      if (!bindings || !ts.isNamedImports(bindings)) {
        continue;
      }

      for (const element of bindings.elements) {
        const name = (element.propertyName ?? element.name).text;
        if (!isSourceModule && !decoratorNames.has(element.name.text)) {
          continue;
        }
        const imported = isSourceModule
          ? name
          : opts.resolver?.originOf({ fromFile: opts.source.fileName, specifier, name });
        if (!imported) {
          continue;
        }
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

  /** The identifiers called as decorators on the file's top-level classes (`@service()`, `@kit.service()` is not followed). */
  private collectClassDecoratorNames(opts: { source: ts.SourceFile }): Set<string> {
    const names = new Set<string>();
    for (const statement of opts.source.statements) {
      if (!ts.isClassDeclaration(statement)) {
        continue;
      }
      for (const decorator of ts.getDecorators(statement) ?? []) {
        const expression = decorator.expression;
        if (ts.isCallExpression(expression) && ts.isIdentifier(expression.expression)) {
          names.add(expression.expression.text);
        }
      }
    }
    return names;
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

    const decorators = ts.getDecorators(node) ?? [];
    for (const decorator of decorators) {
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
    return ArtifactStereotypes.EMIT_ORDER.map((entry) => entry.type)
      .concat(ArtifactTypes.MODEL)
      .find((type) => type === raw);
  }
}
