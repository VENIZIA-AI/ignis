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
  /** One scan reads the same barrels many times: resolutions, parsed files and answers are memoized per resolver. */
  private readonly resolutions = new Map<string, string | undefined>();
  private readonly sources = new Map<string, ts.SourceFile>();
  private readonly origins = new Map<string, string | undefined>();
  private readonly customTypes = new Map<string, string | undefined>();

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
    const key = `${dirname(opts.fromFile)}|${opts.specifier}|${opts.name}`;

    if (!this.origins.has(key)) {
      this.origins.set(key, this.follow({ ...opts, depth: 0, seen: new Set<string>() }));
    }

    return this.origins.get(key);
  }

  /**
   * The type an application's own decorator stands for: `name`, exported by `specifier` as seen from `fromFile`, is followed
   * through re-exports to `const name = ArtifactTypes.define({ type: '<literal>', ... })`. `undefined` when the chain ends
   * anywhere else - a built-in stereotype, a function that is not a `define`, a type that is not a string literal.
   */
  customTypeOf(opts: { fromFile: string; specifier: string; name: string }): string | undefined {
    const key = `${dirname(opts.fromFile)}|${opts.specifier}|${opts.name}`;

    if (!this.customTypes.has(key)) {
      this.customTypes.set(
        key,
        this.follow({
          ...opts,
          depth: 0,
          seen: new Set<string>(),
          declaredIn: (declared) => this.definedTypeIn(declared),
        }),
      );
    }

    return this.customTypes.get(key);
  }

  /** The `type` of `const name = ArtifactTypes.define({ type: '<literal>', ... })` among the top-level statements of `source`. */
  definedTypeIn(opts: { source: ts.SourceFile; name: string }): string | undefined {
    const { source, name } = opts;

    for (const statement of source.statements) {
      if (!ts.isVariableStatement(statement)) {
        continue;
      }

      for (const declaration of statement.declarationList.declarations) {
        const call = declaration.initializer;

        if (
          !ts.isIdentifier(declaration.name) ||
          declaration.name.text !== name ||
          !call ||
          !ts.isCallExpression(call) ||
          !this.isArtifactTypesDefine({ source, call })
        ) {
          continue;
        }

        return this.literalTypeOf({ call });
      }
    }

    return undefined;
  }

  /** `ArtifactTypes.define(...)` where `ArtifactTypes` is imported from a source module in this file. */
  private isArtifactTypesDefine(opts: { source: ts.SourceFile; call: ts.CallExpression }): boolean {
    const { source, call } = opts;
    const callee = call.expression;

    if (
      !ts.isPropertyAccessExpression(callee) ||
      callee.name.text !== 'define' ||
      !ts.isIdentifier(callee.expression)
    ) {
      return false;
    }

    const local = callee.expression.text;

    return source.statements.some((statement) => {
      if (
        !ts.isImportDeclaration(statement) ||
        !ts.isStringLiteral(statement.moduleSpecifier) ||
        !this.isSourceModule({ specifier: statement.moduleSpecifier.text })
      ) {
        return false;
      }

      const bindings = statement.importClause?.namedBindings;

      return (
        !!bindings &&
        ts.isNamedImports(bindings) &&
        bindings.elements.some(
          (element) =>
            element.name.text === local &&
            (element.propertyName ?? element.name).text === 'ArtifactTypes',
        )
      );
    });
  }

  private literalTypeOf(opts: { call: ts.CallExpression }): string | undefined {
    const [argument] = opts.call.arguments;

    if (!argument || !ts.isObjectLiteralExpression(argument)) {
      return undefined;
    }

    for (const entry of argument.properties) {
      if (
        ts.isPropertyAssignment(entry) &&
        ts.isIdentifier(entry.name) &&
        entry.name.text === 'type' &&
        (ts.isStringLiteral(entry.initializer) ||
          ts.isNoSubstitutionTemplateLiteral(entry.initializer))
      ) {
        return entry.initializer.text;
      }
    }

    return undefined;
  }

  private resolveFile(opts: { fromFile: string; specifier: string }): string | undefined {
    const key = `${dirname(opts.fromFile)}|${opts.specifier}`;

    if (!this.resolutions.has(key)) {
      this.resolutions.set(
        key,
        ts.resolveModuleName(opts.specifier, opts.fromFile, this.options, ts.sys).resolvedModule
          ?.resolvedFileName,
      );
    }

    return this.resolutions.get(key);
  }

  private parse(opts: { file: string }): ts.SourceFile {
    let source = this.sources.get(opts.file);

    if (!source) {
      source = ts.createSourceFile(
        opts.file,
        readFileSync(opts.file, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
      );
      this.sources.set(opts.file, source);
    }

    return source;
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
    /** Reads what a file declares itself under `name`; set, the chain ends at a declaration, and a source module ends it with no answer. */
    declaredIn?: (opts: { source: ts.SourceFile; name: string }) => string | undefined;
  }): string | undefined {
    const { fromFile, specifier, name, depth, seen, declaredIn } = opts;

    if (this.isSourceModule({ specifier })) {
      return declaredIn ? undefined : name;
    }

    if (depth >= StereotypeReexportResolver.MAX_DEPTH) {
      return undefined;
    }

    const resolved = this.resolveFile({ fromFile, specifier });
    const visit = `${resolved}#${name}`;

    if (!resolved || seen.has(visit)) {
      return undefined;
    }

    seen.add(visit);

    const source = this.parse({ file: resolved });
    const declared = declaredIn?.({ source, name });

    if (declared !== undefined) {
      return declared;
    }

    const next = (target: { specifier: string; name: string }): string | undefined =>
      this.follow({ fromFile: resolved, ...target, depth: depth + 1, seen, declaredIn });

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
