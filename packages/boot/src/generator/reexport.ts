import { BaseHelper } from '@venizia/ignis-helpers';
import { readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import ts from 'typescript';
import { ArtifactStereotypes } from './common';

/** Follows a named import through `export *` and renaming re-exports until it reaches a source module, so a framework that re-exports the kernel's decorators is recognised. Reads declarations only; never builds a type-checked program. */
export class StereotypeReexportResolver extends BaseHelper {
  static readonly MAX_DEPTH = 10;

  private readonly options: ts.CompilerOptions;
  private readonly sourceModules: Set<string>;

  constructor(opts: { root: string; sourceModules: Set<string> }) {
    super({ scope: StereotypeReexportResolver.name });
    this.sourceModules = opts.sourceModules;
    this.options = StereotypeReexportResolver.compilerOptionsFor({ root: opts.root });
  }

  /** The nearest tsconfig's options (for `paths` aliases), with bundler resolution as the fallback. */
  private static compilerOptionsFor(opts: { root: string }): ts.CompilerOptions {
    const configPath = ts.findConfigFile(opts.root, ts.sys.fileExists);
    const fallback: ts.CompilerOptions = {
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      allowJs: true,
    };
    if (!configPath) {
      return fallback;
    }

    const parsed = ts.parseJsonConfigFileContent(
      ts.readConfigFile(configPath, ts.sys.readFile).config,
      ts.sys,
      dirname(configPath),
    );
    return { ...fallback, ...parsed.options };
  }

  /** The kernel name `name` (exported by `specifier`, as seen from `fromFile`) originates as, or `undefined` when the chain never reaches a source module. */
  originOf(opts: { fromFile: string; specifier: string; name: string }): string | undefined {
    return this.follow({ ...opts, depth: 0, seen: new Set<string>() });
  }

  private isSourceModule(opts: { specifier: string }): boolean {
    return (
      ArtifactStereotypes.SOURCE_MODULES.test(opts.specifier) ||
      this.sourceModules.has(opts.specifier)
    );
  }

  private follow(opts: {
    fromFile: string;
    specifier: string;
    name: string;
    depth: number;
    seen: Set<string>;
  }): string | undefined {
    const { fromFile, specifier, name, depth, seen } = opts;
    if (this.isSourceModule({ specifier })) {
      return name;
    }
    if (depth >= StereotypeReexportResolver.MAX_DEPTH) {
      return undefined;
    }

    const resolved = ts.resolveModuleName(specifier, fromFile, this.options, ts.sys).resolvedModule
      ?.resolvedFileName;
    const visit = `${resolved}#${name}`;
    if (!resolved || seen.has(visit)) {
      return undefined;
    }
    seen.add(visit);

    const source = ts.createSourceFile(
      resolved,
      readFileSync(resolved, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    );
    const next = (target: { specifier: string; name: string }): string | undefined =>
      this.follow({ fromFile: resolved, ...target, depth: depth + 1, seen });

    const importedBy = new Map<string, { specifier: string; name: string }>();
    for (const statement of source.statements) {
      if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
        continue;
      }
      const bindings = statement.importClause?.namedBindings;
      if (!bindings || !ts.isNamedImports(bindings)) {
        continue;
      }
      for (const element of bindings.elements) {
        importedBy.set(element.name.text, {
          specifier: statement.moduleSpecifier.text,
          name: (element.propertyName ?? element.name).text,
        });
      }
    }

    for (const statement of source.statements) {
      if (!ts.isExportDeclaration(statement) || statement.isTypeOnly) {
        continue;
      }
      const fromSpecifier =
        statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)
          ? statement.moduleSpecifier.text
          : undefined;

      if (!statement.exportClause) {
        const origin = fromSpecifier ? next({ specifier: fromSpecifier, name }) : undefined;
        if (origin) {
          return origin;
        }
        continue;
      }
      if (!ts.isNamedExports(statement.exportClause)) {
        continue;
      }

      for (const element of statement.exportClause.elements) {
        if (element.name.text !== name) {
          continue;
        }
        const original = (element.propertyName ?? element.name).text;
        if (fromSpecifier) {
          return next({ specifier: fromSpecifier, name: original });
        }
        const imported = importedBy.get(original);
        return imported ? next(imported) : undefined;
      }
    }

    return undefined;
  }
}
