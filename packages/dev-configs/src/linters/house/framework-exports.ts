import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import type ts from 'typescript';
import { AstNode } from './common';

/** The nearest package.json at or above a folder: where it is, and what it says. */
export interface IPackageManifest {
  directory: string;
  name: string | undefined;
  dependencies: ReadonlyArray<string>;
}

/** Whether a declared name is a type (an interface or a type alias) or something with a runtime value (a class, a function, a const, an enum, a namespace). */
type TDeclarationKind = 'type' | 'value';

/**
 * The type names the installed `@venizia/*` packages export, read from their published `.d.ts` files: the names a project
 * must import, not write again. Only interfaces and type aliases count (a class or a const is not a type your own
 * `interface Logger` copies). A declaration scan only (the TypeScript parser, no program, no type check), memoized per
 * package for the life of the process: after an upgrade an ESLint server must be restarted to read the new names.
 *
 * It never stops a lint run. TypeScript is looked up from the linted package, the working directory and dev-configs' own
 * install, and only a copy that has the parser API is used (the native TypeScript 7 has none); a package.json or a `.d.ts`
 * that cannot be read is skipped. Whatever is missing, the answer is fewer names, never an exception.
 */
export class FrameworkExports {
  static readonly SCOPE = '@venizia/';

  private static readonly manifests = new Map<string, IPackageManifest | null>();
  private static readonly packages = new Map<string, Map<string, string>>();
  private static readonly typescripts = new Map<string, typeof ts | null>();

  /** `value` as the TypeScript module when it has the parser API this scan uses. */
  private static isParser(value: unknown): value is typeof ts {
    return (
      typeof value === 'object' &&
      value !== null &&
      typeof Reflect.get(value, 'createSourceFile') === 'function' &&
      typeof AstNode.readField({ node: Reflect.get(value, 'ScriptTarget'), key: 'Latest' }) ===
        'number'
    );
  }

  /** The text of a file, or `undefined` when it cannot be read. */
  private static readText(opts: { file: string }): string | undefined {
    try {
      return readFileSync(opts.file, 'utf8');
      // eslint-disable-next-line venizia/no-silent-catch -- an unreadable file only means fewer names
    } catch {
      return undefined;
    }
  }

  /** A JSON file, or `undefined` when it cannot be read or does not parse. */
  private static readJson(opts: { file: string }): unknown {
    const text = FrameworkExports.readText(opts);

    if (text === undefined) {
      return undefined;
    }

    try {
      return JSON.parse(text);
      // eslint-disable-next-line venizia/no-silent-catch -- a package.json that does not parse only means fewer names
    } catch {
      return undefined;
    }
  }

  /**
   * TypeScript for the linted package: from its own folder, the working directory, or this package's install, the first that
   * has the parser API. `undefined` when none does (the rule then reports nothing).
   */
  private static loadTypeScript(opts: { directory: string }): typeof ts | undefined {
    const { directory } = opts;
    const cached = FrameworkExports.typescripts.get(directory);

    if (cached !== undefined) {
      return cached ?? undefined;
    }

    const starts = [
      directory,
      process.cwd(),
      typeof __dirname === 'string' ? __dirname : undefined,
    ];

    for (const start of starts) {
      if (start === undefined) {
        continue;
      }

      try {
        const loaded: unknown = createRequire(join(start, 'noop.js'))('typescript');

        if (FrameworkExports.isParser(loaded)) {
          FrameworkExports.typescripts.set(directory, loaded);

          return loaded;
        }
        // eslint-disable-next-line venizia/no-silent-catch -- not installed at this start: the next one is tried
      } catch {
        continue;
      }
    }

    FrameworkExports.typescripts.set(directory, null);

    return undefined;
  }

  /** The nearest package.json at or above `directory`. */
  static manifestFor(opts: { directory: string }): IPackageManifest | undefined {
    const { directory } = opts;
    const cached = FrameworkExports.manifests.get(directory);

    if (cached !== undefined) {
      return cached ?? undefined;
    }

    const file = join(directory, 'package.json');
    let found: IPackageManifest | undefined;

    if (existsSync(file)) {
      const parsed = FrameworkExports.readJson({ file });
      const name = AstNode.readField({ node: parsed, key: 'name' });
      const names = ['dependencies', 'peerDependencies'].flatMap((key) => {
        const group = AstNode.readField({ node: parsed, key });

        return typeof group === 'object' && group !== null ? Object.keys(group) : [];
      });

      found = {
        directory,
        name: typeof name === 'string' ? name : undefined,
        dependencies: names.filter((entry) => entry.startsWith(FrameworkExports.SCOPE)),
      };
    } else {
      const parent = dirname(directory);
      found =
        parent === directory ? undefined : FrameworkExports.manifestFor({ directory: parent });
    }

    FrameworkExports.manifests.set(directory, found ?? null);

    return found;
  }

  /** The folder of the installed package `name`, looked up from `directory` upwards. */
  private static locate(opts: { name: string; directory: string }): string | undefined {
    const candidate = join(opts.directory, 'node_modules', opts.name);

    if (existsSync(join(candidate, 'package.json'))) {
      return candidate;
    }

    const parent = dirname(opts.directory);

    return parent === opts.directory
      ? undefined
      : FrameworkExports.locate({ name: opts.name, directory: parent });
  }

  /** Every `.d.ts` path an `exports` value names, with the subpath it is reached by. */
  private static entriesOf(opts: { manifest: unknown }): Array<{ subpath: string; file: string }> {
    const { manifest } = opts;
    const exported = AstNode.readField({ node: manifest, key: 'exports' });

    const declarations = (value: unknown): Array<string> => {
      if (typeof value === 'string') {
        return /\.d\.[cm]?ts$/.test(value) ? [value] : [];
      }

      return typeof value === 'object' && value !== null
        ? Object.values(value).flatMap((entry) => declarations(entry))
        : [];
    };

    if (typeof exported === 'object' && exported !== null) {
      return Object.entries(exported).flatMap(([key, value]) =>
        declarations(value).map((file) => ({ subpath: key === '.' ? '' : key.slice(1), file })),
      );
    }

    const legacy = AstNode.readField({ node: manifest, key: 'types' });

    return typeof legacy === 'string' ? [{ subpath: '', file: legacy }] : [];
  }

  /** The declaration file a relative specifier points at (`./x.js` is `./x.d.ts`). */
  private static resolveRelative(opts: { from: string; specifier: string }): string | undefined {
    const base = resolve(dirname(opts.from), opts.specifier.replace(/\.(?:[cm]?js|[cm]?ts)$/, ''));

    return [`${base}.d.ts`, `${base}.d.mts`, join(base, 'index.d.ts')].find((file) =>
      existsSync(file),
    );
  }

  /**
   * The names `file` exports, each with what it is, following `export *` into relative files and into other `@venizia/*`
   * packages (an umbrella package re-exports its siblings). A name re-exported by `export { X } from` takes the kind it has
   * where it is declared; `export type { X }` is a type whatever the target says.
   */
  private static namesOf(opts: {
    typescript: typeof ts;
    file: string;
    seen: Set<string>;
  }): Map<string, TDeclarationKind> {
    const { typescript, file, seen } = opts;
    const names = new Map<string, TDeclarationKind>();
    const text = FrameworkExports.readText({ file });

    if (seen.has(file) || text === undefined) {
      return names;
    }

    seen.add(file);

    const source = typescript.createSourceFile(file, text, typescript.ScriptTarget.Latest, false);
    const kindOf = (node: ts.Statement): TDeclarationKind =>
      typescript.isInterfaceDeclaration(node) || typescript.isTypeAliasDeclaration(node)
        ? 'type'
        : 'value';
    const isExported = (node: ts.Node) =>
      typescript.canHaveModifiers(node) &&
      (typescript.getModifiers(node) ?? []).some(
        (modifier) => modifier.kind === typescript.SyntaxKind.ExportKeyword,
      );

    // What the file declares, exported or not: `declare class X {}` then `export { X }` is a value.
    const locals = new Map<string, TDeclarationKind>();

    for (const statement of source.statements) {
      if (typescript.isVariableStatement(statement)) {
        for (const declaration of statement.declarationList.declarations) {
          if (typescript.isIdentifier(declaration.name)) {
            locals.set(declaration.name.text, 'value');
          }
        }
      } else if (
        (typescript.isInterfaceDeclaration(statement) ||
          typescript.isTypeAliasDeclaration(statement) ||
          typescript.isClassDeclaration(statement) ||
          typescript.isFunctionDeclaration(statement) ||
          typescript.isEnumDeclaration(statement) ||
          typescript.isModuleDeclaration(statement)) &&
        statement.name &&
        typescript.isIdentifier(statement.name)
      ) {
        // An interface merged with a class or a namespace of the same name has a value too.
        locals.set(
          statement.name.text,
          locals.get(statement.name.text) === 'value' ? 'value' : kindOf(statement),
        );
      }
    }

    for (const statement of source.statements) {
      if (typescript.isExportDeclaration(statement)) {
        const clause = statement.exportClause;
        const specifier =
          statement.moduleSpecifier && typescript.isStringLiteral(statement.moduleSpecifier)
            ? statement.moduleSpecifier.text
            : undefined;

        if (clause && typescript.isNamedExports(clause)) {
          const remote =
            specifier?.startsWith('.') === true
              ? FrameworkExports.resolveRelative({ from: file, specifier })
              : undefined;
          const there = remote
            ? FrameworkExports.namesOf({ typescript, file: remote, seen: new Set(seen) })
            : undefined;

          for (const element of clause.elements) {
            const original = (element.propertyName ?? element.name).text;
            const kind: TDeclarationKind | undefined =
              statement.isTypeOnly || element.isTypeOnly
                ? 'type'
                : specifier === undefined
                  ? locals.get(original)
                  : there?.get(original);

            if (kind !== undefined) {
              names.set(element.name.text, kind);
            }
          }
        } else if (!clause && specifier?.startsWith('.') === true) {
          const target = FrameworkExports.resolveRelative({ from: file, specifier });

          if (target) {
            for (const [name, kind] of FrameworkExports.namesOf({
              typescript,
              file: target,
              seen,
            })) {
              names.set(name, kind);
            }
          }
        } else if (!clause && specifier?.startsWith(FrameworkExports.SCOPE) === true) {
          const sibling = FrameworkExports.locate({ name: specifier, directory: dirname(file) });

          if (sibling) {
            for (const name of FrameworkExports.readPackage({ directory: sibling }).keys()) {
              names.set(name, 'type');
            }
          }
        }

        continue;
      }

      if (!isExported(statement)) {
        continue;
      }

      if (typescript.isVariableStatement(statement)) {
        for (const declaration of statement.declarationList.declarations) {
          if (typescript.isIdentifier(declaration.name)) {
            names.set(declaration.name.text, 'value');
          }
        }
      } else if (
        (typescript.isInterfaceDeclaration(statement) ||
          typescript.isTypeAliasDeclaration(statement) ||
          typescript.isClassDeclaration(statement) ||
          typescript.isFunctionDeclaration(statement) ||
          typescript.isEnumDeclaration(statement) ||
          typescript.isModuleDeclaration(statement)) &&
        statement.name &&
        typescript.isIdentifier(statement.name)
      ) {
        names.set(statement.name.text, locals.get(statement.name.text) ?? kindOf(statement));
      }
    }

    return names;
  }

  /** Type name to the specifier that exports it (`@venizia/ignis-helpers/common`), for one installed package. */
  private static readPackage(opts: { directory: string }): Map<string, string> {
    const { directory } = opts;
    const cached = FrameworkExports.packages.get(directory);

    if (cached) {
      return cached;
    }

    const exported = new Map<string, string>();
    FrameworkExports.packages.set(directory, exported);

    const typescript = FrameworkExports.loadTypeScript({ directory });
    const manifest = FrameworkExports.readJson({ file: join(directory, 'package.json') });
    const name = AstNode.readField({ node: manifest, key: 'name' });

    if (!typescript || typeof name !== 'string') {
      return exported;
    }

    // A name reachable from several entries is imported from the narrowest one: `/common` over the root that re-exports it.
    const sizes = new Map<string, number>();

    for (const { subpath, file } of FrameworkExports.entriesOf({ manifest })) {
      const path = resolve(directory, file);

      if (!existsSync(path)) {
        continue;
      }

      const declared = FrameworkExports.namesOf({ typescript, file: path, seen: new Set() });
      const types = [...declared].filter(([, kind]) => kind === 'type').map(([entry]) => entry);

      for (const entry of types) {
        if (types.length < (sizes.get(entry) ?? Number.POSITIVE_INFINITY)) {
          sizes.set(entry, types.length);
          exported.set(entry, `${name}${subpath}`);
        }
      }
    }

    return exported;
  }

  /**
   * The type names the `@venizia/*` packages that `directory`'s project depends on export, each with the specifier to import
   * it from. The project's own package is left out: it may declare what it exports.
   */
  static of(opts: { directory: string }): Map<string, string> {
    const manifest = FrameworkExports.manifestFor({ directory: opts.directory });
    const all = new Map<string, string>();

    if (!manifest) {
      return all;
    }

    for (const dependency of manifest.dependencies) {
      const installed = FrameworkExports.locate({
        name: dependency,
        directory: manifest.directory,
      });

      if (!installed || dependency === manifest.name) {
        continue;
      }

      for (const [name, specifier] of FrameworkExports.readPackage({ directory: installed })) {
        if (!all.has(name)) {
          all.set(name, specifier);
        }
      }
    }

    return all;
  }
}
