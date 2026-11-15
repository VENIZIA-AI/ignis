import { readFileSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { CodemodFiles } from './files';

const USAGE = `Usage: devz codemod env-get [paths...] [--write [--all] | --check]

Rewrites the type arguments of applicationEnvironment.get() (and its alias AppEnvs.get()) for the
@venizia/ignis-helpers release where get() reads strings:

  get<string>(key)                      becomes  get(key)
  get<string>(key, { defaultValue })    becomes  get(key, { defaultValue })
  get<R, B>(key, { transform })         becomes  get<R>(key, { transform })

Any other type argument (get<number>(key), get<boolean>(key)) was a cast the new get() no longer allows:
the codemod lists it as "manual" and leaves it. Move the conversion into a transform, or read the
string and convert it where you use it: get(key, { transform: Number }).

It reads TypeScript files (.ts, .tsx, .mts, .cts) and only calls whose receiver is the bare identifier
applicationEnvironment or AppEnvs: a call through this.applicationEnvironment, an alias, an
ApplicationEnvironment instance or an optional chain is not touched and not listed, so run your typecheck
after it. A comment between the method name and the parenthesis is dropped. A .js, .cjs or .mjs file is not read: edit it by hand.

  --write    write the changed files (without it, nothing is written); it needs a path, or --all
  --all      with --write and no path: rewrite every source file under the working directory
  --check    dry run that exits 1 while a file would change (for CI)
  --help     print this text and exit

With no flag it lists what would change and writes nothing. Inside a git repository it reads the files
git knows, and --write refuses a file with local changes: commit or stash it first, so git can undo it.
There is no --reverse: a downgrade restores the files from git.`;

/** A usage error: nothing was read or written. */
const USAGE_ERROR_CODE = 2;

/** The receivers of the environment store `get()` is called on. */
const RECEIVERS = new Set(['applicationEnvironment', 'AppEnvs']);

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
}

/** Rewrites the type arguments of `applicationEnvironment.get()` calls. */
export class EnvGet {
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

    const visit = (node: import('typescript').Node): void => {
      if (
        ts.isCallExpression(node) &&
        node.typeArguments !== undefined &&
        node.questionDotToken === undefined &&
        !(ts.isPropertyAccessExpression(node.expression) && node.expression.questionDotToken) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === 'get' &&
        ts.isIdentifier(node.expression.expression) &&
        RECEIVERS.has(node.expression.expression.text)
      ) {
        const [first, second] = node.typeArguments;
        const start = node.expression.name.getEnd();
        const end = node.arguments.pos - 1;
        const isString = first.kind === ts.SyntaxKind.StringKeyword;

        if (node.typeArguments.length === 2 && node.arguments.length > 1) {
          edits.push({ start, end, text: `<${first.getText(file)}>` });
        } else if (isString && second === undefined) {
          edits.push({ start, end, text: '' });
        } else {
          manual.push(file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1);
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(file);

    if (edits.length === 0) {
      return { output: source, changed: false, rewritten: 0, manual };
    }

    let output = source;

    for (const edit of [...edits].sort((left, right) => right.start - left.start)) {
      output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
    }

    return { output, changed: output !== source, rewritten: edits.length, manual };
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

        for (const line of result.manual) {
          manualCount += 1;
          console.warn(
            `manual  ${shown}:${line}  a type argument the rewrite cannot place (not string, or two without an options argument): a number or other conversion goes in a transform, a union such as string | undefined is dropped by hand`,
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
      `devz codemod env-get: ${changedCount} file(s) ${isWrite ? 'changed' : 'would change'}, ${callCount} call(s) ${isWrite ? 'rewritten' : 'would be rewritten'}, ${manualCount} manual` +
        (refusedCount > 0 ? `, ${refusedCount} refused` : ''),
    );

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
