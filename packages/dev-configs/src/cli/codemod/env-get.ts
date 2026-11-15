import { readFileSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { CodemodFiles } from './files';

const USAGE = `Usage: devz codemod env-get [paths...] [--write [--all] | --check]

Rewrites the type arguments of applicationEnvironment.get() (and its alias AppEnvs.get()) for the
@venizia/ignis-helpers release where get() reads strings:

  get<string>(key)                      becomes  get(key)
  get<string | undefined>(key)          becomes  get(key)
  get<string>(key, { defaultValue })    becomes  get(key, { defaultValue })
  get<R, B>(key, { transform })         becomes  get<R>(key, { transform })

Any other type argument (get<number>(key), get<boolean>(key)) was a cast the new get() no longer allows:
the codemod lists it as "manual" and leaves it. Move the conversion into a transform, or read the
string and convert it where you use it: get(key, { transform: Number }).

It reads TypeScript files (.ts, .tsx, .mts, .cts) and only calls whose receiver is the bare identifier
applicationEnvironment or AppEnvs, or a name the file binds to one of them: an import alias
(import { applicationEnvironment as AppEnv } from '@venizia/ignis-helpers') or a plain
const alias (const env = applicationEnvironment). A call through this.applicationEnvironment, a property, a
parameter, an ApplicationEnvironment instance or an optional chain is not touched and not listed, so run
your typecheck after it. A comment between the method name and the parenthesis is dropped. A .js, .cjs or .mjs file is not read: edit it by hand.

  --write    write the changed files (without it, nothing is written); it needs a path, or --all
  --all      with --write and no path: rewrite every source file under the working directory
  --check    dry run that exits 1 while a file would change (for CI)
  --help     print this text and exit

With no flag it lists what would change and writes nothing. Inside a git repository it reads the files
git knows, and --write refuses a file with local changes: commit or stash it first, so git can undo it.
There is no --reverse: a downgrade restores the files from git.`;

/** A usage error: nothing was read or written. */
const USAGE_ERROR_CODE = 2;

/** The names the environment store is exported under, and so the receivers `get()` is called on. */
const RECEIVERS = new Set(['applicationEnvironment', 'AppEnvs']);

/** A module that exports the store: the root package and the helpers package, with or without a subpath. */
const STORE_MODULE = /^@venizia\/ignis(?:-helpers)?(?:\/.*)?$/;

class EnvGetFlags {
  static readonly WRITE = '--write';
  static readonly ALL = '--all';
  static readonly CHECK = '--check';
  static readonly HELP = '--help';
  static readonly HELP_SHORT = '-h';

  static readonly SCHEME_SET = new Set<string>([
    this.WRITE,
    this.ALL,
    this.CHECK,
    this.HELP,
    this.HELP_SHORT,
  ]);

  static isValid(value: string): boolean {
    return this.SCHEME_SET.has(value);
  }
}

export interface IEnvGetResult {
  output: string;
  changed: boolean;
  /** How many calls were rewritten. */
  rewritten: number;
  /** The calls with a type argument the codemod cannot rewrite: file line numbers (1-based). */
  manual: number[];
  /** The first type argument of each manual call, in the same order as `manual`. */
  manualTypes: string[];
  /** The `get<...>(key)` calls on a receiver the file does not bind to the store (or through an optional chain), left alone and listed: file line (1-based) and the receiver text. */
  skipped: Array<{ line: number; receiver: string }>;
}

/** Rewrites the type arguments of `applicationEnvironment.get()` calls. */
export class EnvGet {
  /** The default receivers plus the names the file binds to them: an import alias, and a plain `const` alias of one. */
  static collectReceivers(opts: {
    typescript: typeof import('typescript');
    file: import('typescript').SourceFile;
  }): Set<string> {
    const { typescript: ts, file } = opts;
    const receivers = new Set(RECEIVERS);

    for (const statement of file.statements) {
      if (
        ts.isImportDeclaration(statement) &&
        ts.isStringLiteral(statement.moduleSpecifier) &&
        STORE_MODULE.test(statement.moduleSpecifier.text) &&
        statement.importClause?.namedBindings !== undefined &&
        ts.isNamedImports(statement.importClause.namedBindings)
      ) {
        for (const element of statement.importClause.namedBindings.elements) {
          if (RECEIVERS.has((element.propertyName ?? element.name).text)) {
            receivers.add(element.name.text);
          }
        }
      }
    }

    const visit = (node: import('typescript').Node): void => {
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer !== undefined &&
        ts.isIdentifier(node.initializer) &&
        receivers.has(node.initializer.text)
      ) {
        receivers.add(node.name.text);
      }

      ts.forEachChild(node, visit);
    };

    visit(file);

    return receivers;
  }

  static rewrite(opts: {
    typescript: typeof import('typescript');
    fileName: string;
    source: string;
  }): IEnvGetResult {
    const { typescript: ts, fileName, source } = opts;
    const scriptKind = fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, scriptKind);
    const edits: Array<{ start: number; end: number; text: string }> = [];
    const manual: number[] = [];
    const manualTypes: string[] = [];
    const skipped: Array<{ line: number; receiver: string }> = [];
    const receivers = EnvGet.collectReceivers({ typescript: ts, file });

    /** `string`, or `string | undefined` (the type `get(key)` already answers): the type argument can go. */
    const isStringType = (node: import('typescript').TypeNode): boolean => {
      if (node.kind === ts.SyntaxKind.StringKeyword) {
        return true;
      }

      if (ts.isParenthesizedTypeNode(node)) {
        return isStringType(node.type);
      }

      if (ts.isUnionTypeNode(node) && node.types.length === 2) {
        const kinds = node.types.map((part) => part.kind);

        return (
          kinds.includes(ts.SyntaxKind.StringKeyword) &&
          kinds.includes(ts.SyntaxKind.UndefinedKeyword)
        );
      }

      return false;
    };

    const visit = (node: import('typescript').Node): void => {
      if (
        ts.isCallExpression(node) &&
        node.typeArguments !== undefined &&
        node.questionDotToken === undefined &&
        !(ts.isPropertyAccessExpression(node.expression) && node.expression.questionDotToken) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === 'get' &&
        ts.isIdentifier(node.expression.expression) &&
        receivers.has(node.expression.expression.text)
      ) {
        const [first, second] = node.typeArguments;
        const start = node.expression.name.getEnd();
        const end = node.arguments.pos - 1;
        const isString = isStringType(first);

        if (node.typeArguments.length === 2 && node.arguments.length > 1) {
          edits.push({ start, end, text: `<${first.getText(file)}>` });
        } else if (isString && second === undefined) {
          edits.push({ start, end, text: '' });
        } else {
          manual.push(file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1);
          manualTypes.push(first.getText(file));
        }
      }

      // Every other `x.get<T>(key)` is listed, never hidden: a store reached through a property, a
      // parameter or an optional chain cannot be resolved here, and a container lookup shares the shape
      // (its first argument is an object literal, so it is not listed).
      else if (
        ts.isCallExpression(node) &&
        node.typeArguments !== undefined &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === 'get' &&
        node.arguments.length > 0 &&
        !ts.isObjectLiteralExpression(node.arguments[0])
      ) {
        skipped.push({
          line: file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1,
          receiver: node.expression.expression.getText(file),
        });
      }

      ts.forEachChild(node, visit);
    };

    visit(file);

    if (edits.length === 0) {
      return { output: source, changed: false, rewritten: 0, manual, manualTypes, skipped };
    }

    let output = source;

    for (const edit of [...edits].sort((left, right) => right.start - left.start)) {
      output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
    }

    return {
      output,
      changed: output !== source,
      rewritten: edits.length,
      manual,
      manualTypes,
      skipped,
    };
  }
}

/** `devz codemod env-get [paths...] [--write | --check]`: rewrites the type arguments of `applicationEnvironment.get()`. */
export class EnvGetCommand {
  static readonly USAGE = USAGE;

  static async run(opts: { root: string; args: string[] }): Promise<number> {
    const { root, args } = opts;

    if (args.includes(EnvGetFlags.HELP) || args.includes(EnvGetFlags.HELP_SHORT)) {
      console.log(USAGE);

      return 0;
    }

    const flags = args.filter((argument) => argument.startsWith('-'));
    const paths = args.filter((argument) => !argument.startsWith('-'));
    const unknown = flags.filter((flag) => !EnvGetFlags.isValid(flag));

    if (unknown.length > 0) {
      console.error(
        `devz codemod: unknown option ${unknown.map((flag) => `"${flag}"`).join(', ')}\n${USAGE}`,
      );

      return USAGE_ERROR_CODE;
    }

    const isWrite = flags.includes(EnvGetFlags.WRITE);
    const isCheck = flags.includes(EnvGetFlags.CHECK);

    if (isWrite && isCheck) {
      console.error(
        `devz codemod: ${EnvGetFlags.WRITE} and ${EnvGetFlags.CHECK} contradict each other\n${USAGE}`,
      );

      return USAGE_ERROR_CODE;
    }

    const refusal = CodemodFiles.refusal({
      command: 'env-get',
      isWrite,
      isAll: flags.includes(EnvGetFlags.ALL),
      paths,
    });

    if (refusal) {
      console.error(`${refusal}\n${USAGE}`);

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
    let changedCount = 0;
    let callCount = 0;
    let manualCount = 0;
    let skippedCount = 0;
    const manualByType = new Map<string, number>();
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

        if (!/\.get\s*</.test(source)) {
          continue;
        }

        const result = EnvGet.rewrite({ typescript, fileName: file, source });
        const shown = relative(root, file).split('\\').join('/') || file;

        for (const [index, line] of result.manual.entries()) {
          const typeText = result.manualTypes[index] ?? '';

          manualCount += 1;
          manualByType.set(typeText, (manualByType.get(typeText) ?? 0) + 1);
          console.warn(
            `manual  ${shown}:${line}  get<${typeText}>: a type argument the rewrite cannot place (not string or string | undefined, or two without an options argument): a number or other conversion goes in a transform, for example get(key, { transform: Number })`,
          );
        }

        for (const call of result.skipped) {
          skippedCount += 1;
          console.warn(
            `skipped  ${shown}:${call.line}  ${call.receiver}.get<...>(): the receiver is not bound to applicationEnvironment or AppEnvs in this file (a property, a parameter, an optional chain or another object): check it by hand if it is the environment store`,
          );
        }

        if (!result.changed) {
          continue;
        }

        if (dirty?.has(file)) {
          refusedCount += 1;
          console.warn(
            `refused  ${shown}  has local changes (commit or stash them, then run again)`,
          );
          continue;
        }

        changedCount += 1;
        callCount += result.rewritten;
        console.log(
          `${isWrite ? 'changed' : 'would change'}  ${shown}  (${result.rewritten} call(s))`,
        );

        if (isWrite) {
          writeFileSync(file, result.output);
        }
      }
    }

    console.log(
      `devz codemod env-get: ${changedCount} file(s) ${isWrite ? 'changed' : 'would change'}, ${callCount} call(s) ${isWrite ? 'rewritten' : 'would be rewritten'}, ${manualCount} manual, ${skippedCount} skipped` +
        (refusedCount > 0 ? `, ${refusedCount} refused` : ''),
    );

    if (manualByType.size > 0) {
      const counts = [...manualByType.entries()]
        .sort((left, right) => right[1] - left[1])
        .map(([typeText, count]) => `${typeText} x${count}`)
        .join(', ');

      console.log(`manual by type argument: ${counts}`);
    }

    if (!isWrite && changedCount > 0) {
      console.log(
        `Nothing was written. Run again with ${EnvGetFlags.WRITE} to apply, then run your typecheck.`,
      );
    }

    if (isWrite && refusedCount > 0) {
      return 1;
    }

    return isCheck && (changedCount > 0 || manualCount > 0) ? 1 : 0;
  }
}
