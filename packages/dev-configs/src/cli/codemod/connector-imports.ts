import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { CodemodFiles } from './files';

const USAGE = `Usage: devz codemod connector-imports [paths...] [--write | --check]

Moves the connector sub-path imports of @venizia/ignis to @venizia/ignis-connectors. The sub-paths
@venizia/ignis/postgres, /postgres/node-postgres, /postgres/postgres-js, /postgres/pglite,
/postgres/supabase, /relational, /sqlite, /sqlite/libsql, /search, /search/controllers, /meilisearch,
/typesense and /typesense/controllers are removed; each one is the same name under
@venizia/ignis-connectors, so the rewrite changes only the specifier.

It reads TypeScript files (.ts, .tsx, .mts, .cts): import and export declarations, import("..."),
require("..."), require.resolve("...") and import.meta.resolve("..."), import("...") types, declare module
"..." and the module name of mock.module("...") style calls. A .js, .cjs or .mjs file is not read: edit it by hand. Other sub-paths of @venizia/ignis (mail, static-asset,
testing, websocket, ...) and the root are not touched. The app must list @venizia/ignis-connectors as a
direct dependency: it reports each package.json that does not.

  --write    write the changed files (without it, nothing is written)
  --check    dry run that exits 1 while a file would change (for CI)
  --help     print this text and exit

With no flag it lists what would change and writes nothing. Inside a git repository it reads the
files git knows (tracked, or untracked and not ignored), and --write refuses a file with local changes
(changed, staged or untracked): commit or stash it first, so git can undo the codemod.`;

/** A usage error: nothing was read or written. */
const USAGE_ERROR_CODE = 2;

const CONNECTORS_PACKAGE = '@venizia/ignis-connectors';
const OLD_PREFIX = '@venizia/ignis/';

/** The call names that take a module name as their first argument besides `require` and `import()`. */
const MODULE_NAME_CALLS = new Set([
  'module',
  'mock',
  'doMock',
  'unmock',
  'importActual',
  'requireActual',
  'importMock',
  'requireMock',
]);

class ConnectorImportsFlags {
  static readonly WRITE = '--write';
  static readonly CHECK = '--check';
  static readonly HELP = '--help';
  static readonly HELP_SHORT = '-h';

  static readonly SCHEME_SET = new Set<string>([
    this.WRITE,
    this.CHECK,
    this.HELP,
    this.HELP_SHORT,
  ]);

  static isValid(value: string): boolean {
    return this.SCHEME_SET.has(value);
  }
}

/** The removed `@venizia/ignis/<sub-path>` specifiers and the `@venizia/ignis-connectors/<sub-path>` they became. */
export class ConnectorSpecifiers {
  static readonly SUBPATHS: ReadonlyArray<string> = [
    'postgres',
    'postgres/node-postgres',
    'postgres/postgres-js',
    'postgres/pglite',
    'postgres/supabase',
    'relational',
    'sqlite',
    'sqlite/libsql',
    'search',
    'search/controllers',
    'meilisearch',
    'typesense',
    'typesense/controllers',
  ];

  static readonly MOVES: ReadonlyMap<string, string> = new Map(
    ConnectorSpecifiers.SUBPATHS.map((subpath) => [
      `${OLD_PREFIX}${subpath}`,
      `${CONNECTORS_PACKAGE}/${subpath}`,
    ]),
  );
}

export interface IConnectorImportsResult {
  output: string;
  changed: boolean;
  /** How many specifiers were moved. */
  rewritten: number;
}

/** Rewrites the module specifiers of the removed connector sub-paths. */
export class ConnectorImports {
  static rewrite(opts: {
    typescript: typeof import('typescript');
    fileName: string;
    source: string;
  }): IConnectorImportsResult {
    const { typescript: ts, fileName, source } = opts;
    const scriptKind = fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, scriptKind);
    const edits: Array<{ start: number; end: number; text: string }> = [];

    const consider = (literal: import('typescript').Node | undefined) => {
      if (!literal || !ts.isStringLiteralLike(literal)) {
        return;
      }

      const moved = ConnectorSpecifiers.MOVES.get(literal.text);

      if (moved === undefined) {
        return;
      }

      const start = literal.getStart(file);
      const quote = source[start];
      edits.push({ start, end: literal.getEnd(), text: `${quote}${moved}${quote}` });
    };

    const isModuleNameCall = (call: import('typescript').CallExpression): boolean => {
      const callee = call.expression;

      if (callee.kind === ts.SyntaxKind.ImportKeyword) {
        return true;
      }

      if (ts.isIdentifier(callee)) {
        return callee.text === 'require';
      }

      if (!ts.isPropertyAccessExpression(callee)) {
        return false;
      }

      if (callee.name.text === 'resolve') {
        return (
          (ts.isIdentifier(callee.expression) && callee.expression.text === 'require') ||
          ts.isMetaProperty(callee.expression)
        );
      }

      return MODULE_NAME_CALLS.has(callee.name.text);
    };

    const visit = (node: import('typescript').Node): void => {
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
        consider(node.moduleSpecifier);
      } else if (ts.isImportEqualsDeclaration(node)) {
        if (ts.isExternalModuleReference(node.moduleReference)) {
          consider(node.moduleReference.expression);
        }
      } else if (ts.isCallExpression(node)) {
        if (isModuleNameCall(node)) {
          consider(node.arguments[0]);
        }
      } else if (ts.isModuleDeclaration(node)) {
        consider(node.name);
      } else if (ts.isImportTypeNode(node)) {
        if (ts.isLiteralTypeNode(node.argument)) {
          consider(node.argument.literal);
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(file);

    if (edits.length === 0) {
      return { output: source, changed: false, rewritten: 0 };
    }

    let output = source;

    for (const edit of edits.sort((a, b) => b.start - a.start)) {
      output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
    }

    return { output, changed: true, rewritten: edits.length };
  }

  /**
   * The `package.json` nearest to `file` (not above `root`), and whether it lists the connectors package; `undefined` when
   * there is none to read.
   */
  static findManifest(opts: {
    file: string;
    root: string;
  }): { path: string; hasConnectors: boolean } | undefined {
    const { file, root } = opts;
    let directory = dirname(file);

    for (;;) {
      const candidate = join(directory, 'package.json');

      if (existsSync(candidate)) {
        let manifest: unknown;

        try {
          manifest = JSON.parse(readFileSync(candidate, 'utf8'));
        } catch (error) {
          console.warn(
            `${candidate}  is not valid JSON, so its dependencies were not checked | ${error instanceof Error ? error.message : String(error)}`,
          );

          return undefined;
        }

        const listed =
          typeof manifest === 'object' &&
          manifest !== null &&
          ['dependencies', 'devDependencies', 'peerDependencies'].some((field) => {
            const group: unknown = Reflect.get(manifest, field);

            return typeof group === 'object' && group !== null && CONNECTORS_PACKAGE in group;
          });

        return { path: candidate, hasConnectors: listed };
      }

      if (directory === root || dirname(directory) === directory) {
        return undefined;
      }

      directory = dirname(directory);
    }
  }
}

/**
 * `devz codemod connector-imports [paths...] [--write | --check]`: moves the removed
 * `@venizia/ignis/<connector sub-path>` specifiers to `@venizia/ignis-connectors`. It is a dry run unless `--write`
 * is given. `--check` is the same dry run, and exits 1 while a file would change.
 */
export class ConnectorImportsCommand {
  static readonly USAGE = USAGE;

  static async run(opts: { root: string; args: string[] }): Promise<number> {
    const { root, args } = opts;

    if (
      args.includes(ConnectorImportsFlags.HELP) ||
      args.includes(ConnectorImportsFlags.HELP_SHORT)
    ) {
      console.log(USAGE);

      return 0;
    }

    const flags = args.filter((argument) => argument.startsWith('-'));
    const paths = args.filter((argument) => !argument.startsWith('-'));

    const unknown = flags.filter((flag) => !ConnectorImportsFlags.isValid(flag));

    if (unknown.length > 0) {
      console.error(
        `devz codemod: unknown option ${unknown.map((flag) => `"${flag}"`).join(', ')}\n${USAGE}`,
      );

      return USAGE_ERROR_CODE;
    }

    const isWrite = flags.includes(ConnectorImportsFlags.WRITE);
    const isCheck = flags.includes(ConnectorImportsFlags.CHECK);

    if (isWrite && isCheck) {
      console.error(
        `devz codemod: ${ConnectorImportsFlags.WRITE} and ${ConnectorImportsFlags.CHECK} contradict each other\n${USAGE}`,
      );

      return USAGE_ERROR_CODE;
    }

    let typescript: typeof import('typescript');

    try {
      const loaded = await import('typescript');
      typescript = loaded.default;
    } catch {
      console.error('devz codemod: the "typescript" package is required to read your sources');

      return 1;
    }

    const targets = (paths.length > 0 ? paths : ['.']).map((path) => resolve(root, path));
    const missing = new Set<string>();
    let changedCount = 0;
    let specifierCount = 0;
    let refusedCount = 0;

    for (const target of targets) {
      const files = CodemodFiles.collect({ target });
      const dirty = isWrite ? CodemodFiles.dirty({ target }) : undefined;

      if (files.length === 0 && paths.length > 0) {
        console.warn(
          `devz codemod: no source files under "${relative(root, target) || target}" (git ignores the path, or it holds none): nothing was read`,
        );
      }

      for (const file of files) {
        const source = readFileSync(file, 'utf8');

        if (!source.includes(OLD_PREFIX)) {
          continue;
        }

        const result = ConnectorImports.rewrite({ typescript, fileName: file, source });

        if (!result.changed) {
          continue;
        }

        const shown = relative(root, file).split('\\').join('/') || file;

        if (dirty?.has(file)) {
          refusedCount += 1;
          console.warn(
            `refused  ${shown}  has local changes (commit or stash them, then run again)`,
          );
          continue;
        }

        changedCount += 1;
        specifierCount += result.rewritten;
        console.log(
          `${isWrite ? 'changed' : 'would change'}  ${shown}  (${result.rewritten} specifier(s))`,
        );

        const manifest = ConnectorImports.findManifest({ file, root });

        if (manifest && !manifest.hasConnectors) {
          missing.add(relative(root, manifest.path).split('\\').join('/') || manifest.path);
        }

        if (isWrite) {
          writeFileSync(file, result.output);
        }
      }
    }

    console.log(
      `devz codemod connector-imports: ${changedCount} file(s) ${isWrite ? 'changed' : 'would change'}, ${specifierCount} specifier(s) ${isWrite ? 'moved' : 'would be moved'}` +
        (refusedCount > 0 ? `, ${refusedCount} refused` : ''),
    );

    for (const manifestPath of [...missing].sort()) {
      console.warn(
        `${manifestPath}  does not list ${CONNECTORS_PACKAGE}: add it as a dependency, because the imports now come from it`,
      );
    }

    if (!isWrite && changedCount > 0) {
      console.log(
        `Nothing was written. Run again with ${ConnectorImportsFlags.WRITE} to apply, then add the dependency and run your typecheck.`,
      );
    }

    if (isWrite && refusedCount > 0) {
      return 1;
    }

    return isCheck && changedCount > 0 ? 1 : 0;
  }
}
