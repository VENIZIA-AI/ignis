import { existsSync, readFileSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';

const LINT_CONFIG = '.configs/lints/oxlint.config.mts';
const ESLINT_CONFIG = '.configs/lints/eslint.config.mjs';
const FORMAT_CONFIG = '.configs/formatters/oxfmt.config.mts';
const LINT_IGNORE_FILE = '.configs/lints/.ignore';
const FORMAT_IGNORE_FILE = '.configs/formatters/.ignore';
const ESLINT_CACHE = ['--cache', '--cache-location', 'node_modules/.cache/eslint/'];
const LINTED_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.js', '.mjs']);
const FORMAT_GLOB = '**/*.{ts,tsx,mts,js,mjs}';
const FIX_FLAG = '--fix';

/** One tool call: the tool name and its arguments, run from the project root. */
export interface ILintStep {
  tool: string;
  args: string[];
}

/**
 * `dev-configs lint [--fix] [files]`: oxlint, then ESLint, then oxfmt, from the project's
 * `.configs/lints/` and `.configs/formatters/`. With no file it checks the whole project; with
 * files it handles only those, as a pre-commit hook passes them.
 */
export class LintCommand {
  /**
   * The patterns of an ignore file, one per line, `#` comments and blank lines skipped. An ignore
   * file resolves its patterns from its own folder, so they go on the command line instead, which
   * resolves from the project root.
   */
  static readIgnore(opts: { root: string; file: string }): string[] {
    const path = join(opts.root, opts.file);
    if (!existsSync(path)) {
      return [];
    }

    return readFileSync(path, 'utf8')
      .split('\n')
      .map(line => line.trim())
      .filter(line => line !== '' && !line.startsWith('#'));
  }

  /** The tool calls for these arguments, in order; empty when a file list holds nothing to lint. */
  static plan(opts: { root: string; args: string[] }): ILintStep[] {
    const fix = opts.args[0] === FIX_FLAG;
    const paths = fix ? opts.args.slice(1) : opts.args;
    const whole = paths.length === 0;
    const files = paths.filter(path => LINTED_EXTENSIONS.has(extname(path)));

    if (!whole && files.length === 0) {
      return [];
    }

    const targets = whole ? ['.'] : files;
    const lintIgnore = LintCommand.readIgnore({ root: opts.root, file: LINT_IGNORE_FILE }).flatMap(
      pattern => ['--ignore-pattern', pattern],
    );
    const formatIgnore = LintCommand.readIgnore({ root: opts.root, file: FORMAT_IGNORE_FILE }).map(
      pattern => `!${pattern}`,
    );
    const unmatched = whole ? [] : ['--no-error-on-unmatched-pattern'];
    const eslintQuiet = whole ? [] : ['--no-warn-ignored'];

    return [
      {
        tool: 'oxlint',
        args: [
          '-c',
          LINT_CONFIG,
          ...lintIgnore,
          ...unmatched,
          fix ? FIX_FLAG : '--deny-warnings',
          ...targets,
        ],
      },
      {
        tool: 'eslint',
        args: [
          '-c',
          ESLINT_CONFIG,
          ...ESLINT_CACHE,
          ...eslintQuiet,
          ...lintIgnore,
          ...(fix ? [FIX_FLAG] : []),
          ...targets,
        ],
      },
      {
        tool: 'oxfmt',
        args: [
          '-c',
          FORMAT_CONFIG,
          ...unmatched,
          ...(fix ? [] : ['--check']),
          ...(whole ? [FORMAT_GLOB] : files),
          ...formatIgnore,
        ],
      },
    ];
  }

  /** The tool's binary in the nearest `node_modules/.bin`, else its bare name for PATH to find. */
  static resolveTool(opts: { root: string; tool: string }): string {
    let dir = opts.root;
    while (true) {
      const candidate = join(dir, 'node_modules', '.bin', opts.tool);
      if (existsSync(candidate)) {
        return candidate;
      }

      const parent = dirname(dir);
      if (parent === dir) {
        return opts.tool;
      }
      dir = parent;
    }
  }

  /** Runs the plan in order and stops at the first tool that fails; returns the exit code. */
  static async run(opts: { root: string; args: string[] }): Promise<number> {
    for (const step of LintCommand.plan(opts)) {
      const child = Bun.spawn({
        cmd: [LintCommand.resolveTool({ root: opts.root, tool: step.tool }), ...step.args],
        cwd: opts.root,
        stdio: ['inherit', 'inherit', 'inherit'],
      });
      const exitCode = await child.exited;

      if (exitCode !== 0) {
        return exitCode;
      }
    }

    return 0;
  }
}
