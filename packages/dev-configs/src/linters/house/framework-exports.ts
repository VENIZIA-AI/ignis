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

/**
 * What the installed `@venizia/*` packages export, read from their published `.d.ts` files: the names a project must
 * import, not write again. A declaration scan only (the TypeScript parser, no program, no type check), memoized per
 * package for the life of the process, so a lint run reads each package once.
 */
export class FrameworkExports {
  static readonly SCOPE = '@venizia/';

  private static readonly manifests = new Map<string, IPackageManifest | null>();
  private static readonly packages = new Map<string, Map<string, string>>();
  private static loaded: { module: typeof ts | undefined } | undefined;

  /** TypeScript, from the project being linted; `undefined` when it is not installed there (the rule then reports nothing). */
  private static loadTypeScript(): typeof ts | undefined {
    if (FrameworkExports.loaded === undefined) {
      try {
        const load = createRequire(join(process.cwd(), 'noop.js'));
        FrameworkExports.loaded = { module: load('typescript') };
        // eslint-disable-next-line venizia/no-silent-catch -- not installed is an answer: the rule reports nothing without it
      } catch {
        FrameworkExports.loaded = { module: undefined };
      }
    }

    return FrameworkExports.loaded.module;
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
      const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
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

  /** The names `file` exports, following `export *` into relative files. */
  private static namesOf(opts: {
    typescript: typeof ts;
    file: string;
    seen: Set<string>;
  }): Array<string> {
    const { typescript, file, seen } = opts;

    if (seen.has(file)) {
      return [];
    }

    seen.add(file);

    const source = typescript.createSourceFile(
      file,
      readFileSync(file, 'utf8'),
      typescript.ScriptTarget.Latest,
      false,
    );
    const names: Array<string> = [];
    const isExported = (node: ts.Node) =>
      typescript.canHaveModifiers(node) &&
      (typescript.getModifiers(node) ?? []).some(
        (modifier) => modifier.kind === typescript.SyntaxKind.ExportKeyword,
      );

    for (const statement of source.statements) {
      if (typescript.isExportDeclaration(statement)) {
        const clause = statement.exportClause;

        if (clause && typescript.isNamedExports(clause)) {
          names.push(...clause.elements.map((element) => element.name.text));
        } else if (clause && typescript.isNamespaceExport(clause)) {
          names.push(clause.name.text);
        } else if (
          !clause &&
          statement.moduleSpecifier &&
          typescript.isStringLiteral(statement.moduleSpecifier) &&
          statement.moduleSpecifier.text.startsWith('.')
        ) {
          const target = FrameworkExports.resolveRelative({
            from: file,
            specifier: statement.moduleSpecifier.text,
          });

          if (target) {
            names.push(...FrameworkExports.namesOf({ typescript, file: target, seen }));
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
            names.push(declaration.name.text);
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
        names.push(statement.name.text);
      }
    }

    return names;
  }

  /** Name to the specifier that exports it (`@venizia/ignis-helpers/common`), for one installed package. */
  private static readPackage(opts: { directory: string }): Map<string, string> {
    const { directory } = opts;
    const cached = FrameworkExports.packages.get(directory);

    if (cached) {
      return cached;
    }

    const exported = new Map<string, string>();
    const typescript = FrameworkExports.loadTypeScript();
    FrameworkExports.packages.set(directory, exported);

    if (!typescript) {
      return exported;
    }

    const manifest: unknown = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'));
    const name = AstNode.readField({ node: manifest, key: 'name' });

    if (typeof name !== 'string') {
      return exported;
    }

    // A name reachable from several entries is imported from the narrowest one: `/common` over the root that re-exports it.
    const sizes = new Map<string, number>();

    for (const { subpath, file } of FrameworkExports.entriesOf({ manifest })) {
      const path = resolve(directory, file);

      if (!existsSync(path)) {
        continue;
      }

      const names = new Set(FrameworkExports.namesOf({ typescript, file: path, seen: new Set() }));

      for (const entry of names) {
        if (names.size < (sizes.get(entry) ?? Number.POSITIVE_INFINITY)) {
          sizes.set(entry, names.size);
          exported.set(entry, `${name}${subpath}`);
        }
      }
    }

    return exported;
  }

  /**
   * The names the `@venizia/*` packages that `directory`'s project depends on export, each with the specifier to import it
   * from. The project's own package is left out: it may declare what it exports.
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
