import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { migrateModelSettings } from './model-settings';

const SKIPPED_DIRECTORIES = new Set(['node_modules', 'dist', 'build', '.git']);
const SOURCE_PATTERN = /\.(?:ts|tsx|mts|cts)$/;

const USAGE = 'Usage: devz codemod model-settings [paths...] [--check]';

/** Every source file under `target`: the file itself, or the `.ts` files below a directory. */
const collectFiles = (target: string): string[] => {
  const stats = statSync(target);

  if (stats.isFile()) {
    return [target];
  }

  const files: string[] = [];
  for (const entry of readdirSync(target, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(entry.name)) {
        files.push(...collectFiles(join(target, entry.name)));
      }
      continue;
    }

    if (SOURCE_PATTERN.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      files.push(join(target, entry.name));
    }
  }

  return files;
};

/**
 * `devz codemod model-settings [paths...] [--check]`: moves `@model` settings from the flat keys
 * (`defaultFilter`, `defaultLimit`, `maxLimit`, `scopeFilter`) to `query` and `access`. Without
 * `--check` it writes the files; with it, it only lists what would change and exits 1 when
 * anything would.
 */
export class CodemodCommand {
  static async run(opts: { root: string; args: string[] }): Promise<number> {
    const [name, ...rest] = opts.args;

    if (name !== 'model-settings') {
      console.error(`devz codemod: unknown codemod "${name ?? ''}"\n${USAGE}`);
      return 1;
    }

    const isCheck = rest.includes('--check');
    const paths = rest.filter((argument) => !argument.startsWith('--'));
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
      for (const file of collectFiles(target)) {
        const source = readFileSync(file, 'utf8');

        if (!source.includes('@model')) {
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
          `${isCheck ? 'would change' : 'changed'}  ${shown}  (${result.rewritten} model(s))`,
        );

        if (!isCheck) {
          writeFileSync(file, result.output);
        }
      }
    }

    console.log(
      `devz codemod model-settings: ${changedCount} file(s) ${isCheck ? 'would change' : 'changed'}, ${reportCount} left untouched`,
    );

    return isCheck && changedCount > 0 ? 1 : 0;
  }
}
