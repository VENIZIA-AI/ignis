import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import type ts from 'typescript';
import { AstNode } from './common';
import { FrameworkExports } from './framework-exports';

/** One export of a package's public entry points, and what its TSDoc says. */
export interface IPublicExport {
  /** The exported name. */
  name: string;
  /** Whether it is a value (class, function, const, enum, namespace) or a type (interface, type alias). */
  isValue: boolean;
  /** Absolute path of the file that declares it (for `export * as X`, the file that holds the statement). */
  file: string;
  /** Character offsets of the declaring name. */
  start: number;
  end: number;
  /** `@useWhen` is there and says something. */
  hasUseWhen: boolean;
  /** `@insteadOf` is there and says nothing. */
  hasEmptyInsteadOf: boolean;
}

/**
 * The public surface of one package: what its entry points export, read with the TypeScript checker over the entry files
 * only (own symbols; what a package re-exports from another is that package's to document). Built once per package and
 * memoized for the run, so a lint run pays for one program per package.
 *
 * Entries are the `exports` of package.json mapped back to source (`./dist/esm/x.d.ts` is `src/x.ts`), or the `entries`
 * the project names.
 */
export class PublicSurface {
  static readonly USE_WHEN = 'useWhen';
  static readonly INSTEAD_OF = 'insteadOf';

  private static readonly surfaces = new Map<string, Map<string, Array<IPublicExport>>>();

  /** The source file an `exports` declaration path stands for: `./dist/esm/a/index.d.ts` is `src/a/index.ts` (or `.tsx`). */
  private static sourceOf(opts: { directory: string; declaration: string }): string | undefined {
    const stripped = opts.declaration
      .replace(/^\.\//, '')
      .replace(/^dist\//, '')
      .replace(/^(?:esm|cjs|types)\//, '')
      .replace(/\.d\.[cm]?ts$/, '');

    return [`${stripped}.ts`, `${stripped}.tsx`]
      .map((file) => join(opts.directory, 'src', file))
      .find((file) => existsSync(file));
  }

  /** The `.d.ts` paths in an `exports` value. */
  private static declarationsIn(opts: { value: unknown }): Array<string> {
    const { value } = opts;

    if (typeof value === 'string') {
      return /\.d\.[cm]?ts$/.test(value) ? [value] : [];
    }

    return typeof value === 'object' && value !== null
      ? Object.values(value).flatMap((entry) => PublicSurface.declarationsIn({ value: entry }))
      : [];
  }

  /** The entry source files of the package at `directory`. */
  private static entriesOf(opts: {
    directory: string;
    entries: ReadonlyArray<string> | undefined;
  }): Array<string> {
    const { directory, entries } = opts;

    if (entries) {
      return entries.map((entry) => resolve(directory, entry)).filter((file) => existsSync(file));
    }

    const text = existsSync(join(directory, 'package.json'))
      ? readFileSync(join(directory, 'package.json'), 'utf8')
      : '{}';
    let manifest: unknown;

    try {
      manifest = JSON.parse(text);
      // eslint-disable-next-line venizia/no-silent-catch -- a package.json that does not parse has no entries to read
    } catch {
      manifest = undefined;
    }

    const files = PublicSurface.declarationsIn({
      value: AstNode.readField({ node: manifest, key: 'exports' }),
    })
      .map((declaration) => PublicSurface.sourceOf({ directory, declaration }))
      .filter((file): file is string => file !== undefined);

    return [...new Set(files)];
  }

  /** The compiler options of the nearest tsconfig.json, for `paths` aliases. */
  private static optionsFor(opts: {
    typescript: typeof ts;
    directory: string;
  }): ts.CompilerOptions {
    const { typescript, directory } = opts;
    const configPath = typescript.findConfigFile(directory, typescript.sys.fileExists);
    const parsed = configPath
      ? typescript.parseJsonConfigFileContent(
          typescript.readConfigFile(configPath, typescript.sys.readFile).config,
          typescript.sys,
          dirname(configPath),
        ).options
      : {};

    return { ...parsed, noEmit: true, skipLibCheck: true, allowJs: false };
  }

  /** The tag texts of `name` on `symbol`, read through the checker and, for an `export * as X` statement, from the statement. */
  private static tagsOf(opts: {
    typescript: typeof ts;
    checker: ts.TypeChecker;
    symbol: ts.Symbol;
    target: ts.Symbol;
  }): Map<string, string> {
    const { typescript, checker, symbol, target } = opts;
    const tags = new Map<string, string>();

    const collect = (list: ReadonlyArray<ts.JSDocTagInfo>) => {
      for (const tag of list) {
        tags.set(tag.name, typescript.displayPartsToString(tag.text).trim());
      }
    };

    collect(target.getJsDocTags(checker));
    collect(symbol.getJsDocTags(checker));

    for (const declaration of symbol.declarations ?? []) {
      const statement = typescript.isNamespaceExport(declaration) ? declaration.parent : undefined;

      if (statement) {
        for (const tag of typescript.getJSDocTags(statement)) {
          tags.set(tag.tagName.text, typescript.getTextOfJSDocComment(tag.comment)?.trim() ?? '');
        }
      }
    }

    return tags;
  }

  /** Every export of the entries of the package at `directory`, each once, that the package itself declares. */
  private static scan(opts: {
    directory: string;
    entries: ReadonlyArray<string> | undefined;
  }): Map<string, Array<IPublicExport>> {
    const { directory, entries } = opts;
    const byFile = new Map<string, Array<IPublicExport>>();
    const typescript = FrameworkExports.loadTypeScript({ directory });
    const roots = PublicSurface.entriesOf({ directory, entries });

    if (!typescript || roots.length === 0) {
      return byFile;
    }

    const program = typescript.createProgram(
      roots,
      PublicSurface.optionsFor({ typescript, directory }),
    );
    const checker = program.getTypeChecker();
    const seen = new Set<string>();
    const inside = (file: string) =>
      !file.endsWith('.d.ts') &&
      !file.split(sep).includes('node_modules') &&
      relative(directory, file).startsWith('..') === false;
    const valueFlags =
      typescript.SymbolFlags.Class |
      typescript.SymbolFlags.Function |
      typescript.SymbolFlags.Variable |
      typescript.SymbolFlags.Enum |
      typescript.SymbolFlags.ValueModule |
      typescript.SymbolFlags.NamespaceModule;

    for (const root of roots) {
      const source = program.getSourceFile(root);
      const module = source ? checker.getSymbolAtLocation(source) : undefined;

      if (!module) {
        continue;
      }

      for (const symbol of checker.getExportsOfModule(module)) {
        const isAlias = (symbol.flags & typescript.SymbolFlags.Alias) !== 0;
        const target = isAlias ? checker.getAliasedSymbol(symbol) : symbol;
        const namespaceExport = (symbol.declarations ?? []).find((declaration) =>
          typescript.isNamespaceExport(declaration),
        );
        const site = namespaceExport ?? target.declarations?.[0];
        const file = site?.getSourceFile().fileName;

        if (!site || !file || !inside(file)) {
          continue;
        }

        const name = symbol.getName();
        const key = `${file}#${name}`;

        if (seen.has(key)) {
          continue;
        }

        seen.add(key);

        const tags = PublicSurface.tagsOf({ typescript, checker, symbol, target });
        const named = typescript.getNameOfDeclaration(site) ?? site;
        const list = byFile.get(file) ?? [];

        list.push({
          name,
          isValue: namespaceExport !== undefined || (target.flags & valueFlags) !== 0,
          file,
          start: named.getStart(),
          end: named.getEnd(),
          hasUseWhen: (tags.get(PublicSurface.USE_WHEN) ?? '').length > 0,
          hasEmptyInsteadOf: tags.get(PublicSurface.INSTEAD_OF) === '',
        });
        byFile.set(file, list);
      }
    }

    return byFile;
  }

  /** The exports of the package at `directory`, by the file that declares them. */
  static of(opts: {
    directory: string;
    entries?: ReadonlyArray<string>;
  }): Map<string, Array<IPublicExport>> {
    const key = `${opts.directory}|${(opts.entries ?? []).join(',')}`;
    const cached = PublicSurface.surfaces.get(key);

    if (cached) {
      return cached;
    }

    const surface = PublicSurface.scan({ directory: opts.directory, entries: opts.entries });
    PublicSurface.surfaces.set(key, surface);

    return surface;
  }

  /** The package folder of `file`: where the nearest package.json is. */
  static packageOf(opts: { file: string }): string | undefined {
    return FrameworkExports.manifestFor({ directory: dirname(opts.file) })?.directory;
  }
}
