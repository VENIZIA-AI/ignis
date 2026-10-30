import { readFileSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import type { Linter } from 'eslint';
import { CodemodFiles } from './files';

const USAGE = `Usage: devz codemod async-style [paths...] [--write | --check]

Applies the fixers of three house lint rules, so a repository can sweep them without a lint pass:

  venizia/no-inline-await         \`expect(await f())\` becomes \`const result = await f(); expect(result)\`
  venizia/no-return-await         \`return await f()\` becomes \`return f()\` (\`const result = await f(); return result;\` in a try)
  venizia/no-await-promise-chain  \`const x = await f().catch(() => null)\` becomes
                                  \`let x; try { x = await f(); } catch (error) { x = null; }\`

It changes only what the fixers can change safely, and lists the rest with its file, line and rule:
an \`await\` inside a ternary or logical operand, a loop test, an unbraced \`if\` branch, or after a call
that may have effects; an awaited \`.then\` or \`.finally\`, a \`.catch\` whose handler has a block body or
calls something, and an awaited chain that is not the whole initializer of a \`const\` or \`let\`; and
every venizia/no-silent-catch finding (a handler or catch block that swallows the error), which it never
fixes: what to log is your decision.

  --write    write the changed files (without it, nothing is written)
  --check    dry run that exits 1 when anything would change or is left unfixed (for CI)
  --help     print this text and exit

With no flag it lists what would change and writes nothing. Inside a git repository it reads the
files git knows (tracked, or untracked and not ignored), and --write refuses a file with local changes
(changed, staged or untracked): commit or stash it first, so git can undo the codemod.`;

/** A usage error: nothing was read or written. */
const USAGE_ERROR_CODE = 2;

/** A file that can hold an `await` or a `catch`. */
const ASYNC_TEXT = /\b(await|catch)\b/;

class AsyncStyleFlags {
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

export interface IAsyncStyleReport {
  line: number;
  column: number;
  /** The rule id, or `undefined` for a file ESLint could not parse. */
  ruleId: string | null;
  message: string;
}

export interface IAsyncStyleResult {
  output: string;
  changed: boolean;
  /** How many findings of the original source carried a fix, once the fixers changed it. */
  fixes: number;
  /** What is still reported after every pass. */
  reports: IAsyncStyleReport[];
}

/** Runs the async-style rules, and only those, over source text with ESLint's own fixer loop. */
export class AsyncStyle {
  /** The `Linter` config: the TypeScript parser and the rules of `asyncStyleConfigs`, at error. */
  static async createConfig(): Promise<Linter.Config[]> {
    const { default: tseslint } = await import('typescript-eslint');
    const { asyncStyleConfigs } = await import('../../linters/house/index.js');

    return [
      {
        files: ['**/*.{ts,tsx,mts,cts}'],
        languageOptions: { parser: tseslint.parser },
        // Only the async-style rules run here, so a `// eslint-disable-next-line` for any other rule looks unused and
        // ESLint's fixer would delete it. A codemod never touches a directive.
        linterOptions: { reportUnusedDisableDirectives: 'off' },
      },
      ...asyncStyleConfigs,
    ];
  }

  /** Fixes `source` (ESLint applies up to ten passes) and returns the text and what is left. `filename` is relative to the linter's `cwd`. */
  static fix(opts: {
    linter: Linter;
    config: Linter.Config[];
    source: string;
    filename: string;
  }): IAsyncStyleResult {
    const { linter, config, source, filename } = opts;
    // A fix can leave a new finding behind (the try/catch of no-await-promise-chain is a silent catch when the
    // fallback is a constant), so the count is of the fixable findings, not of the findings that went away.
    const fixable = linter
      .verify(source, config, { filename })
      .filter((message) => message.fix !== undefined).length;
    const result = linter.verifyAndFix(source, config, { filename });

    return {
      output: result.output,
      changed: result.output !== source,
      fixes: result.fixed ? fixable : 0,
      reports: result.messages.map((message) => ({
        line: message.line,
        column: message.column,
        ruleId: message.ruleId,
        message: message.message,
      })),
    };
  }
}

/**
 * `devz codemod async-style [paths...] [--write | --check]`: applies the fixers of `no-inline-await`,
 * `no-return-await` and `no-await-promise-chain`, and lists what is left of those and of `no-silent-catch`.
 * It is a dry run unless `--write` is given. `--check` is the same dry run, and exits 1 when anything would
 * change or is left unfixed.
 */
export class AsyncStyleCommand {
  static readonly USAGE = USAGE;

  static async run(opts: { root: string; args: string[] }): Promise<number> {
    const { root, args } = opts;

    if (args.includes(AsyncStyleFlags.HELP) || args.includes(AsyncStyleFlags.HELP_SHORT)) {
      console.log(USAGE);
      return 0;
    }

    const flags = args.filter((argument) => argument.startsWith('-'));
    const paths = args.filter((argument) => !argument.startsWith('-'));

    const unknown = flags.filter((flag) => !AsyncStyleFlags.isValid(flag));
    if (unknown.length > 0) {
      console.error(
        `devz codemod: unknown option ${unknown.map((flag) => `"${flag}"`).join(', ')}\n${USAGE}`,
      );
      return USAGE_ERROR_CODE;
    }

    const isWrite = flags.includes(AsyncStyleFlags.WRITE);
    const isCheck = flags.includes(AsyncStyleFlags.CHECK);

    if (isWrite && isCheck) {
      console.error(
        `devz codemod: ${AsyncStyleFlags.WRITE} and ${AsyncStyleFlags.CHECK} contradict each other\n${USAGE}`,
      );
      return USAGE_ERROR_CODE;
    }

    let linter: Linter;
    try {
      const { Linter: EslintLinter } = await import('eslint');
      linter = new EslintLinter({ cwd: root });
    } catch {
      console.error('devz codemod: the "eslint" package is required to run the lint fixers');
      return 1;
    }

    const config = await AsyncStyle.createConfig();
    const targets = (paths.length > 0 ? paths : ['.']).map((path) => resolve(root, path));
    let changedCount = 0;
    let fixCount = 0;
    let reportCount = 0;
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

        if (!ASYNC_TEXT.test(source)) {
          continue;
        }

        const shown = relative(root, file).split('\\').join('/');
        const result = AsyncStyle.fix({ linter, config, source, filename: shown });

        for (const report of result.reports) {
          reportCount += 1;
          console.warn(
            `${shown}:${report.line}:${report.column}  ${report.ruleId ?? 'parse error'}  ${report.message}`,
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
        fixCount += result.fixes;
        console.log(`${isWrite ? 'changed' : 'would change'}  ${shown}  (${result.fixes} fix(es))`);

        if (isWrite) {
          writeFileSync(file, result.output);
        }
      }
    }

    console.log(
      `devz codemod async-style: ${changedCount} file(s) ${isWrite ? 'changed' : 'would change'}, ${fixCount} fix(es) ${isWrite ? 'applied' : 'would be applied'}, ${reportCount} left unfixed` +
        (refusedCount > 0 ? `, ${refusedCount} refused` : ''),
    );

    if (!isWrite && changedCount > 0) {
      console.log(`Nothing was written. Run again with ${AsyncStyleFlags.WRITE} to apply.`);
    }

    if (isWrite && refusedCount > 0) {
      return 1;
    }

    return isCheck && (changedCount > 0 || reportCount > 0) ? 1 : 0;
  }
}
