import { readFileSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { CodemodFiles } from './files';
import { CliOutput } from '../../common/cli-output';

const USAGE = `Usage: devz codemod class-renames [paths...] [--write [--all] | --check] [--reverse]

Renames the exports IGNIS renamed, at the import and at every use in the file: the zod schemas and types renamed
with the naming rules (such as trackableHeaders to TrackableHeadersSchema), and the classes RetryHelper, SlugHelper
and CredentialHelper (@venizia/ignis-helpers) become RetryUtility, SlugUtility and CredentialUtility,
RejectionHelper and SpawnHelper (@venizia/dev-configs/testing) become RejectionUtility and SpawnUtility. One
table, in this file; a later rename adds a row.

It reads TypeScript files (.ts, .tsx, .mts, .cts): a named import or re-export from the package that owns
the class is renamed, and so is each use of the name it brought in (an aliased import, "Old as Alias", keeps
its alias and changes only the imported name). A namespace import's member ("ns.Old") is renamed too. A .js,
.cjs or .mjs file is not read, and neither is "import('pkg').Old": edit those by hand. A property or method that
has the same name as a class is left alone.

  --write    write the changed files (without it, nothing is written); it needs a path, or --all
  --all      with --write and no path: rewrite every source file under the working directory
  --check    dry run that exits 1 while a file would change (for CI)
  --reverse  rename back, for a downgrade
  --help     print this text and exit

With no flag it lists what would change and writes nothing. Inside a git repository it reads the files git
knows (tracked, or untracked and not ignored), and --write refuses a file with local changes (changed since staged, or untracked): commit, stash or "git add" it first, so git can undo the codemod.`;

/** A usage error: nothing was read or written. */
const USAGE_ERROR_CODE = 2;

class ClassRenameFlags {
  static readonly WRITE = '--write';
  static readonly ALL = '--all';
  static readonly CHECK = '--check';
  static readonly REVERSE = '--reverse';
  static readonly HELP = '--help';
  static readonly HELP_SHORT = '-h';

  static readonly SCHEME_SET = new Set<string>([
    this.WRITE,
    this.ALL,
    this.CHECK,
    this.REVERSE,
    this.HELP,
    this.HELP_SHORT,
  ]);

  static isValid(value: string): boolean {
    return this.SCHEME_SET.has(value);
  }
}

export interface IClassRename {
  oldName: string;
  newName: string;
  /** The packages that export it; a module specifier is theirs when it is the package or a sub-path of it. */
  packages: ReadonlyArray<string>;
  /** Static members renamed with the class: old name to new. */
  members?: Readonly<Record<string, string>>;
}

/** `@venizia/ignis` re-exports the helpers as types only, so a value import of these classes comes from `@venizia/ignis-helpers`. */
const HELPERS = ['@venizia/ignis-helpers', '@venizia/ignis'];
const TESTING = ['@venizia/dev-configs/testing'];
const KERNEL = ['@venizia/ignis-kernel', '@venizia/ignis'];

/** The renamed classes: add a row for the next rename. */
export class ClassRenameTable {
  static readonly ROWS: ReadonlyArray<IClassRename> = [
    { oldName: 'RetryHelper', newName: 'RetryUtility', packages: HELPERS },
    { oldName: 'SlugHelper', newName: 'SlugUtility', packages: HELPERS },
    { oldName: 'CredentialHelper', newName: 'CredentialUtility', packages: HELPERS },
    { oldName: 'RejectionHelper', newName: 'RejectionUtility', packages: TESTING },
    { oldName: 'SpawnHelper', newName: 'SpawnUtility', packages: TESTING },
    { oldName: 'trackableHeaders', newName: 'TrackableHeadersSchema', packages: KERNEL },
    { oldName: 'countableHeaders', newName: 'CountableHeadersSchema', packages: KERNEL },
    { oldName: 'defaultRequestHeaders', newName: 'DefaultRequestHeadersSchema', packages: KERNEL },
    { oldName: 'TErrorResponse', newName: 'TErrorOutput', packages: KERNEL },
    {
      oldName: 'vaultAuthSchema',
      newName: 'VaultAuthSchema',
      packages: ['@venizia/ignis-helpers'],
    },
    { oldName: 'ISecretsRegistration', newName: 'TSecretsRegistration', packages: HELPERS },
    { oldName: 'IWebSocketServerOptions', newName: 'TWebSocketServerOptions', packages: HELPERS },
    {
      oldName: 'IRelationalDataSourceOpening',
      newName: 'TRelationalDataSourceOpening',
      packages: ['@venizia/ignis-connectors'],
    },
  ];
}

export interface IClassRenamesResult {
  output: string;
  changed: boolean;
  /** How many identifiers were renamed. */
  rewritten: number;
}

/** What a codemod did to one file. */
export interface ICodemodRewrite {
  output: string;
  changed: boolean;
  rewritten: number;
  /** The lines the codemod leaves to a person. */
  manual: Array<{ line: number; note: string }>;
  /** Lines worth a review that are no work of the codemod: `--check` does not fail on them. */
  info?: Array<{ line: number; note: string }>;
}

/** A codemod that runs through the command of this file: which files it reads, and what it does to one. */
export interface IFileCodemod {
  name: string;
  usage: string;
  isReversible: boolean;
  /** Whether the codemod removes the names it counts, so the summary does not say it renamed them. */
  isRemoval?: boolean;
  /** What the summary counts, and what a write did to it; renamed names by default. */
  unit?: { noun: string; verb: string };
  /** A file holding none of these is not read. */
  marks: (opts: { reverse: boolean }) => ReadonlyArray<string>;
  rewrite: (input: {
    typescript: typeof import('typescript');
    fileName: string;
    source: string;
    reverse: boolean;
  }) => ICodemodRewrite;
}

/** The prefix of the alias a renamed import gets when the file already declares the new name. */
const ALIAS_PREFIX = 'Ignis';

/** Renames the classes of `ClassRenameTable` where a file imports them. */
export class ClassRenames {
  private static reversed(opts: { row: IClassRename }): IClassRename {
    const { row } = opts;
    const members = Object.fromEntries(
      Object.entries(row.members ?? {}).map(([from, to]) => [to, from]),
    );

    return { ...row, oldName: row.newName, newName: row.oldName, members };
  }

  /** The renamed class of `ns.Class`, for the members read through a namespace import. */
  private static namespaceOwner(opts: {
    typescript: typeof import('typescript');
    node: import('typescript').Node;
    namespaces: Map<string, ReadonlyArray<IClassRename>>;
  }): IClassRename | undefined {
    const { typescript: ts, node, namespaces } = opts;
    let scope: import('typescript').Node;
    let member: string;

    if (ts.isPropertyAccessExpression(node)) {
      [scope, member] = [node.expression, node.name.text];
    } else if (ts.isQualifiedName(node)) {
      [scope, member] = [node.left, node.right.text];
    } else if (
      ts.isElementAccessExpression(node) &&
      ts.isStringLiteralLike(node.argumentExpression)
    ) {
      [scope, member] = [node.expression, node.argumentExpression.text];
    } else {
      return undefined;
    }

    return ts.isIdentifier(scope)
      ? namespaces.get(scope.text)?.find((row) => row.oldName === member)
      : undefined;
  }

  /** Whether the file declares or imports a name that a renamed import would collide with. */
  private static declares(opts: {
    typescript: typeof import('typescript');
    file: import('typescript').SourceFile;
    name: string;
  }): boolean {
    const { typescript: ts, file, name } = opts;
    let isDeclared = false;

    const walk = (node: import('typescript').Node): void => {
      const isDeclaration =
        ts.isVariableDeclaration(node) ||
        ts.isBindingElement(node) ||
        ts.isParameter(node) ||
        ts.isFunctionDeclaration(node) ||
        ts.isClassDeclaration(node) ||
        ts.isInterfaceDeclaration(node) ||
        ts.isTypeAliasDeclaration(node) ||
        ts.isEnumDeclaration(node) ||
        ts.isImportClause(node) ||
        ts.isImportSpecifier(node) ||
        ts.isNamespaceImport(node) ||
        ts.isImportEqualsDeclaration(node);

      if (isDeclaration && node.name && ts.isIdentifier(node.name) && node.name.text === name) {
        isDeclared = true;
      }

      ts.forEachChild(node, walk);
    };

    walk(file);

    return isDeclared;
  }

  static rewrite(opts: {
    typescript: typeof import('typescript');
    fileName: string;
    source: string;
    /** Rename the new names back to the old ones. */
    reverse?: boolean;
    /** The renames to apply; the class rename table by default. */
    rows?: ReadonlyArray<IClassRename>;
  }): IClassRenamesResult {
    const { typescript: ts, fileName, source, reverse = false } = opts;
    const rows = (opts.rows ?? ClassRenameTable.ROWS).map((row) =>
      reverse ? ClassRenames.reversed({ row }) : row,
    );
    const scriptKind = fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, scriptKind);
    const edits = new Map<number, { start: number; end: number; text: string }>();

    const rowsOf = (specifier: string): ReadonlyArray<IClassRename> =>
      rows.filter((row) =>
        row.packages.some((name) => specifier === name || specifier.startsWith(`${name}/`)),
      );

    const rename = (node: import('typescript').Node, row: IClassRename, text = row.newName) => {
      const start = node.getStart(file);
      edits.set(start, { start, end: node.getEnd(), text });
    };

    /** The local names to rename everywhere in the file, and the namespace imports whose members are renamed. */
    const locals = new Map<string, IClassRename>();
    const namespaces = new Map<string, ReadonlyArray<IClassRename>>();
    /** Every local name of a renamed class, aliases included: its members are renamed through it. */
    const owners = new Map<string, IClassRename>();

    for (const statement of file.statements) {
      if (
        (ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) &&
        statement.moduleSpecifier &&
        ts.isStringLiteralLike(statement.moduleSpecifier)
      ) {
        const owned = rowsOf(statement.moduleSpecifier.text);

        if (owned.length === 0) {
          continue;
        }

        if (ts.isImportDeclaration(statement)) {
          const bindings = statement.importClause?.namedBindings;

          if (bindings && ts.isNamespaceImport(bindings)) {
            namespaces.set(bindings.name.text, owned);
            continue;
          }

          if (!bindings || !ts.isNamedImports(bindings)) {
            continue;
          }

          for (const element of bindings.elements) {
            const imported = element.propertyName ?? element.name;
            const row = owned.find((entry) => entry.oldName === imported.text);

            if (!row) {
              continue;
            }

            owners.set(element.name.text, row);

            if (element.propertyName) {
              rename(imported, row);
              continue;
            }

            const isTaken = ClassRenames.declares({ typescript: ts, file, name: row.newName });
            const local = isTaken ? `${ALIAS_PREFIX}${row.newName}` : row.newName;
            rename(imported, row, isTaken ? `${row.newName} as ${local}` : row.newName);
            locals.set(element.name.text, { ...row, newName: local });
          }
        } else if (statement.exportClause && ts.isNamedExports(statement.exportClause)) {
          for (const element of statement.exportClause.elements) {
            const exported = element.propertyName ?? element.name;
            const row = owned.find((entry) => entry.oldName === exported.text);

            if (row) {
              rename(exported, row);
            }
          }
        }
      }
    }

    if (locals.size === 0 && namespaces.size === 0 && edits.size === 0) {
      return { output: source, changed: false, rewritten: 0 };
    }

    /** An identifier that names a property, member or attribute, not the class. */
    const isMemberName = (node: import('typescript').Identifier): boolean => {
      const parent = node.parent;

      if (ts.isPropertyAccessExpression(parent)) {
        return parent.name === node;
      }

      if (ts.isQualifiedName(parent)) {
        return parent.right === node;
      }

      if (ts.isBindingElement(parent)) {
        return parent.propertyName === node;
      }

      return (
        (ts.isPropertyAssignment(parent) ||
          ts.isPropertyDeclaration(parent) ||
          ts.isPropertySignature(parent) ||
          ts.isMethodDeclaration(parent) ||
          ts.isMethodSignature(parent) ||
          ts.isGetAccessorDeclaration(parent) ||
          ts.isSetAccessorDeclaration(parent) ||
          ts.isEnumMember(parent) ||
          ts.isJsxAttribute(parent)) &&
        parent.name === node
      );
    };

    const visit = (node: import('typescript').Node): void => {
      if (ts.isImportDeclaration(node) || (ts.isExportDeclaration(node) && node.moduleSpecifier)) {
        return;
      }

      if (ts.isIdentifier(node)) {
        const row = locals.get(node.text);

        if (row && !isMemberName(node)) {
          // `{ Old }` in an object literal or a destructuring keeps its key: `{ Old: New }`.
          const isShorthand =
            (ts.isShorthandPropertyAssignment(node.parent) && node.parent.name === node) ||
            (ts.isBindingElement(node.parent) &&
              !node.parent.propertyName &&
              node.parent.name === node);

          rename(node, row, isShorthand ? `${node.text}: ${row.newName}` : row.newName);
        }
      }

      if (ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression)) {
        const { expression, argumentExpression } = node;
        const name = argumentExpression.text;
        const owned = ts.isIdentifier(expression) ? namespaces.get(expression.text) : undefined;
        const holder = ts.isIdentifier(expression)
          ? owners.get(expression.text)
          : ClassRenames.namespaceOwner({ typescript: ts, node: expression, namespaces });
        const row = owned?.find((entry) => entry.oldName === name) ?? holder;
        const renamed = owned ? row?.newName : holder?.members?.[name];

        if (row && renamed) {
          const quote = argumentExpression.getText(file).charAt(0);
          rename(argumentExpression, row, `${quote}${renamed}${quote}`);
        }
      }

      if (ts.isPropertyAccessExpression(node) || ts.isQualifiedName(node)) {
        const [scope, member] = ts.isPropertyAccessExpression(node)
          ? [node.expression, node.name]
          : [node.left, node.right];
        const owned = ts.isIdentifier(scope) ? namespaces.get(scope.text) : undefined;
        const row = owned?.find((entry) => entry.oldName === member.text);

        if (row) {
          rename(member, row);
        }

        // A static member of the class: through its local name, or through a namespace import.
        const holder = ts.isIdentifier(scope)
          ? owners.get(scope.text)
          : ClassRenames.namespaceOwner({ typescript: ts, node: scope, namespaces });
        const renamed = holder?.members?.[member.text];

        if (holder && renamed) {
          rename(member, holder, renamed);
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(file);

    let output = source;

    for (const edit of [...edits.values()].sort((a, b) => b.start - a.start)) {
      output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
    }

    return { output, changed: output !== source, rewritten: edits.size };
  }
}

/**
 * `devz codemod class-renames [paths...] [--write [--all] | --check] [--reverse]`: renames the classes IGNIS
 * renamed. It is a dry run unless `--write` is given. `--check` is the same dry run, and exits 1 while a file
 * would change.
 */
export class ClassRenamesCommand {
  static readonly USAGE = USAGE;

  /** A table of renames as a codemod under its own command name. */
  static ofRows(opts: {
    name: string;
    usage: string;
    rows: ReadonlyArray<IClassRename>;
  }): IFileCodemod {
    const { name, usage, rows } = opts;

    return {
      name,
      usage,
      isReversible: true,
      marks: ({ reverse }) => rows.map((row) => (reverse ? row.newName : row.oldName)),
      rewrite: (input) => ({ ...ClassRenames.rewrite({ ...input, rows }), manual: [] }),
    };
  }

  static async run(opts: {
    root: string;
    args: string[];
    /** Another codemod to run this way; the class renames by default. */
    codemod?: IFileCodemod;
  }): Promise<number> {
    const { root, args } = opts;
    const codemod =
      opts.codemod ??
      ClassRenamesCommand.ofRows({
        name: 'class-renames',
        usage: USAGE,
        rows: ClassRenameTable.ROWS,
      });

    if (args.includes(ClassRenameFlags.HELP) || args.includes(ClassRenameFlags.HELP_SHORT)) {
      CliOutput.log(codemod.usage);

      return 0;
    }

    const flags = args.filter((argument) => argument.startsWith('-'));
    const paths = args.filter((argument) => !argument.startsWith('-'));
    const unknown = flags.filter((flag) => !ClassRenameFlags.isValid(flag));

    if (unknown.length > 0) {
      CliOutput.error(
        `devz codemod: unknown option ${unknown.map((flag) => `"${flag}"`).join(', ')}\n${codemod.usage}`,
      );

      return USAGE_ERROR_CODE;
    }

    const isWrite = flags.includes(ClassRenameFlags.WRITE);
    const isCheck = flags.includes(ClassRenameFlags.CHECK);
    const isReverse = flags.includes(ClassRenameFlags.REVERSE);

    if (isReverse && !codemod.isReversible) {
      CliOutput.error(
        `devz codemod: ${codemod.name} has no ${ClassRenameFlags.REVERSE}\n${codemod.usage}`,
      );

      return USAGE_ERROR_CODE;
    }

    if (isWrite && isCheck) {
      CliOutput.error(
        `devz codemod: ${ClassRenameFlags.WRITE} and ${ClassRenameFlags.CHECK} contradict each other\n${codemod.usage}`,
      );

      return USAGE_ERROR_CODE;
    }

    const refusal = CodemodFiles.refusal({
      command: codemod.name,
      isWrite,
      isAll: flags.includes(ClassRenameFlags.ALL),
      paths,
    });

    if (refusal) {
      CliOutput.error(`${refusal}\n${codemod.usage}`);

      return USAGE_ERROR_CODE;
    }

    let typescript: typeof import('typescript');

    try {
      const loaded = await import('typescript');
      typescript = loaded.default;
    } catch {
      CliOutput.error('devz codemod: the "typescript" package is required to read your sources');

      return 1;
    }

    const names = codemod.marks({ reverse: isReverse });
    const targets = (paths.length > 0 ? paths : ['.']).map((path) => resolve(root, path));
    let changedCount = 0;
    let renamedCount = 0;
    let refusedCount = 0;
    let manualCount = 0;
    const { noun, verb } = codemod.unit ?? {
      noun: 'name(s)',
      verb: codemod.isRemoval ? 'removed' : 'renamed',
    };

    for (const target of targets) {
      const files = CodemodFiles.collect({ target });
      const dirty = isWrite ? CodemodFiles.dirty({ target }) : undefined;

      if (files.length === 0 && paths.length > 0) {
        CliOutput.warn(
          `devz codemod: no source files under "${relative(root, target) || target}" (git ignores the path, or it holds none): nothing was read`,
        );
      }

      for (const file of files) {
        const source = readFileSync(file, 'utf8');

        if (!names.some((name) => source.includes(name))) {
          continue;
        }

        const result = codemod.rewrite({
          typescript,
          fileName: file,
          source,
          reverse: isReverse,
        });
        const shown = relative(root, file).split('\\').join('/') || file;

        manualCount += result.manual.length;

        for (const entry of result.manual) {
          CliOutput.log(`manual  ${shown}:${entry.line}  ${entry.note}`);
        }

        for (const entry of result.info ?? []) {
          CliOutput.log(`review  ${shown}:${entry.line}  ${entry.note}`);
        }

        if (!result.changed) {
          continue;
        }

        if (dirty?.has(file)) {
          refusedCount += 1;
          CliOutput.warn(
            `refused  ${shown}  has local changes (commit, stash or "git add" them, then run again)`,
          );
          continue;
        }

        changedCount += 1;
        renamedCount += result.rewritten;
        CliOutput.log(
          `${isWrite ? 'changed' : 'would change'}  ${shown}  (${result.rewritten} ${noun})`,
        );

        if (isWrite) {
          writeFileSync(file, result.output);
        }
      }
    }

    CliOutput.log(
      `devz codemod ${codemod.name}: ${changedCount} file(s) ${isWrite ? 'changed' : 'would change'}, ${renamedCount} ${noun} ${isWrite ? verb : `would be ${verb}`}` +
        (refusedCount > 0 ? `, ${refusedCount} refused` : ''),
    );

    if (!isWrite && changedCount > 0) {
      CliOutput.log(
        `Nothing was written. Run again with ${ClassRenameFlags.WRITE} to apply, then run your typecheck.`,
      );
    }

    if (isWrite && refusedCount > 0) {
      return 1;
    }

    return isCheck && changedCount + manualCount > 0 ? 1 : 0;
  }
}
