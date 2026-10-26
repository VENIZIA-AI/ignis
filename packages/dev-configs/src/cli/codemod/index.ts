import { readFileSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { DropRedundantCastsCommand } from './drop-redundant-casts';
import { CodemodFiles } from './files';
import { migrateModelSettings } from './model-settings';

const USAGE = `Usage: devz codemod model-settings [paths...] [--write | --check]

Moves @model settings to the grouped shape and skipMigrate to migration.use.

  --write    write the changed files (without it, nothing is written)
  --check    dry run that exits 1 when anything would change or is left untouched (for CI)
  --help     print this text and exit

With no flag it lists what would change and writes nothing. Inside a git repository it reads the
files git knows (tracked, or untracked and not ignored), so ignored folders are never touched.`;

/** A file that can hold a `@model` call: the decorator, an aliased import of it, or `ns.model(`. */
const MODEL_TEXT = /@model\b|\bmodel\s+as\s+\w+|\.model\(/;

/** A usage error: nothing was read or written. */
const USAGE_ERROR_CODE = 2;

class CodemodFlags {
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

/**
 * `devz codemod model-settings [paths...] [--write | --check]`: moves `@model` settings from the
 * flat keys (`defaultFilter`, `defaultLimit`, `maxLimit`, `scopeFilter`) to `query` and `access`,
 * and `skipMigrate` to `migration.use`. It is a dry run unless `--write` is given: it lists what
 * would change. `--check` is the same dry run, and exits 1 when anything would change or is
 * left untouched (an untouched model still throws when its decorator runs).
 */
export class CodemodCommand {
  static async run(opts: { root: string; args: string[] }): Promise<number> {
    const { args } = opts;

    const [name, ...rest] = args;

    if (name === 'drop-redundant-casts') {
      return DropRedundantCastsCommand.run({ root: opts.root, args: rest });
    }

    if (args.includes(CodemodFlags.HELP) || args.includes(CodemodFlags.HELP_SHORT)) {
      console.log(`${USAGE}\n\n${DropRedundantCastsCommand.USAGE}`);
      return 0;
    }

    if (name !== 'model-settings') {
      console.error(`devz codemod: unknown codemod "${name ?? ''}"\n${USAGE}`);
      return USAGE_ERROR_CODE;
    }

    const unknown = rest.filter(
      (argument) => argument.startsWith('-') && !CodemodFlags.isValid(argument),
    );
    if (unknown.length > 0) {
      console.error(
        `devz codemod: unknown option ${unknown.map((flag) => `"${flag}"`).join(', ')}\n${USAGE}`,
      );
      return USAGE_ERROR_CODE;
    }

    const isWrite = rest.includes(CodemodFlags.WRITE);
    const isCheck = rest.includes(CodemodFlags.CHECK);

    if (isWrite && isCheck) {
      console.error(
        `devz codemod: ${CodemodFlags.WRITE} and ${CodemodFlags.CHECK} contradict each other\n${USAGE}`,
      );
      return USAGE_ERROR_CODE;
    }

    const paths = rest.filter((argument) => !argument.startsWith('-'));
    const targets = (paths.length > 0 ? paths : ['.']).map((path) => resolve(opts.root, path));

    let typescript: typeof import('typescript');
    try {
      typescript = (await import('typescript')).default;
    } catch {
      console.error('devz codemod: the "typescript" package is required to read your sources');
      return 1;
    }

    let changedCount = 0;
    let reportCount = 0;

    for (const target of targets) {
      for (const file of CodemodFiles.collect({ target })) {
        const source = readFileSync(file, 'utf8');

        if (!MODEL_TEXT.test(source)) {
          continue;
        }

        const result = migrateModelSettings({ typescript, fileName: file, source });
        const shown = relative(opts.root, file) || file;

        for (const report of result.reports) {
          reportCount += 1;
          console.warn(`${shown}:${report.line}:${report.column}  ${report.reason}`);
        }

        if (!result.changed) {
          continue;
        }

        changedCount += 1;
        console.log(
          `${isWrite ? 'changed' : 'would change'}  ${shown}  (${result.rewritten} model(s))`,
        );

        if (isWrite) {
          writeFileSync(file, result.output);
        }
      }
    }

    console.log(
      `devz codemod model-settings: ${changedCount} file(s) ${isWrite ? 'changed' : 'would change'}, ${reportCount} left untouched`,
    );

    if (!isWrite && changedCount > 0) {
      console.log(`Nothing was written. Run again with ${CodemodFlags.WRITE} to apply.`);
    }

    if (isCheck && changedCount === 0 && reportCount > 0) {
      console.log(
        'Nothing to rewrite, but the models above throw when the decorator runs: fix them by hand.',
      );
    }

    return isCheck && (changedCount > 0 || reportCount > 0) ? 1 : 0;
  }
}
