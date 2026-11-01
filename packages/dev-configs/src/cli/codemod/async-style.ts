import { readFileSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import type { Linter } from 'eslint';
import { CodemodFiles } from './files';

const USAGE = `Usage: devz codemod async-style [paths...] [--write | --check]

Applies the fixers of two house lint rules, so a repository can sweep them without a lint pass:

  venizia/no-inline-await   \`expect(await f())\` becomes \`const result = await f(); expect(result)\`
  venizia/no-return-await   \`return await f()\` becomes \`return f()\` (\`const result = await f(); return result;\` in a try)

It changes only what the fixers can change safely. An \`await\` inside a ternary or logical operand, a loop
test, an unbraced \`if\` branch, or after a call that may have effects is listed with its file, line and
rule, and left for you.

  --write    write the changed files (without it, nothing is written)
  --check    dry run that exits 1 when anything would change or is left unfixed (for CI)
  --help     print this text and exit

With no flag it lists what would change and writes nothing. Inside a git repository it reads the
files git knows (tracked, or untracked and not ignored), and --write refuses a file with local changes
(changed, staged or untracked): commit or stash it first, so git can undo the codemod.`;

/** A usage error: nothing was read or written. */
const USAGE_ERROR_CODE = 2;

/** A file that can hold an `await`. */
const AWAIT_TEXT = /\bawait\b/;

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
  /** How many findings the fixers removed. */
  fixes: number;
  /** What is still reported after every pass. */
  reports: IAsyncStyleReport[];
}

/** Runs the two async-style rules, and only those, over source text with ESLint's own fixer loop. */
export class AsyncStyle {
  /** The `Linter` config: the TypeScript parser and the two rules at error, from `asyncStyleConfigs`. */
  static async createConfig(): Promise<Linter.Config[]> {
    const { default: tseslint } = await import('typescript-eslint');
    const { asyncStyleConfigs } = await import('../../linters/house/index.js');

    return [
      {
        files: ['**/*.{ts,tsx,mts,cts}'],
        languageOptions: { parser: tseslint.parser },
        // Only two rules run here, so a `// eslint-disable-next-line` for any other rule looks unused and
        // ESLint's fixer would delete it. A codemod never touches a directive.
        linterOptions: { reportUnusedDisableDirectives: 'off' },
      },
      ...asyncStyleConfigs,
    ];
  }

  /**
   * The self-check's config: four scope rules, run on the text before and after the fixers. A hoisted name must be
   * declared once, shadow nothing, be used after it is declared and be used at all; when the fixers break one of these
   * the count of that rule goes up, and the file is left as it was.
   */
  static async createChecks(): Promise<Linter.Config[]> {
    const { default: tseslint } = await import('typescript-eslint');

    return [
      {
        files: ['**/*.{ts,tsx,mts,cts}'],
        languageOptions: { parser: tseslint.parser },
        linterOptions: { reportUnusedDisableDirectives: 'off' },
        plugins: { '@typescript-eslint': tseslint.plugin as never },
        rules: {
          '@typescript-eslint/no-redeclare': 'error',
          '@typescript-eslint/no-shadow': 'error',
          '@typescript-eslint/no-use-before-define': [
            'error',
            { functions: false, classes: false },
          ],
          '@typescript-eslint/no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }],
        },
      },
    ];
  }

  /** What got worse between `source` and `output` by the self-check's rules: empty when nothing did. */
  static selfCheck(opts: {
    linter: Linter;
    checks: Linter.Config[];
    source: string;
    output: string;
    filename: string;
  }): string[] {
    const { linter, checks, source, output, filename } = opts;
    const count = (text: string): Map<string, number> => {
      const found = new Map<string, number>();
      for (const message of linter.verify(text, checks, { filename })) {
        const key = message.ruleId ?? 'parse error';
        found.set(key, (found.get(key) ?? 0) + 1);
      }

      return found;
    };
    const was = count(source);
    const now = count(output);

    return [...now]
      .filter(([rule, total]) => total > (was.get(rule) ?? 0))
      .map(([rule, total]) => `${rule}: ${was.get(rule) ?? 0} before, ${total} after`);
  }

  /**
   * Fixes `source` (ESLint applies up to ten passes) and returns the text and what is left. `filename` is relative to
   * the linter's `cwd`. The fixed text is checked against the original (`checks`): if it has more redeclarations,
   * shadowed names, uses before declaration or unused variables than the original, no fix is returned and the file is
   * reported as `self-check`, so a hoisted name that does not match the expression it replaced never reaches a file.
   */
  static fix(opts: {
    linter: Linter;
    config: Linter.Config[];
    checks: Linter.Config[];
    source: string;
    filename: string;
  }): IAsyncStyleResult {
    const { linter, config, checks, source, filename } = opts;
    const before = linter.verify(source, config, { filename }).length;
    const result = linter.verifyAndFix(source, config, { filename });

    if (result.output !== source) {
      const broken = AsyncStyle.selfCheck({
        linter,
        checks,
        source,
        output: result.output,
        filename,
      });

      if (broken.length > 0) {
        return {
          output: source,
          changed: false,
          fixes: 0,
          reports: [
            {
              line: 1,
              column: 1,
              ruleId: 'self-check',
              message: `the fixers would have made this file worse (${broken.join('; ')}); it is left as it was - fix it by hand`,
            },
          ],
        };
      }
    }

    return {
      output: result.output,
      changed: result.output !== source,
      fixes: result.fixed ? Math.max(0, before - result.messages.length) : 0,
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
 * `devz codemod async-style [paths...] [--write | --check]`: applies the fixers of `no-inline-await`
 * and `no-return-await`. It is a dry run unless `--write` is given. `--check` is the same dry run, and
 * exits 1 when anything would change or is left unfixed.
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
    const checks = await AsyncStyle.createChecks();
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

        if (!AWAIT_TEXT.test(source)) {
          continue;
        }

        const shown = relative(root, file).split('\\').join('/');
        const result = AsyncStyle.fix({ linter, config, checks, source, filename: shown });

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
