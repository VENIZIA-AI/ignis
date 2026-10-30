import { readFileSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { CodemodFiles } from '../files';
import { type INamespaceMapping, NamespaceMappings } from './mapping';
import { ALL_MAPPINGS } from './mappings';
import { NamespaceFunctions } from './rewriter';

export * from './mapping';
export * from './mappings';
export * from './rewriter';

const USAGE = `Usage: devz codemod namespace-functions [paths...] [--write | --check]

Moves calls of an IGNIS function that now lives in a class to the class form, with one options
object: \`oldName(a, b)\` becomes \`ClassName.method({ first: a, second: b })\`, and an argument named
like its key is written short (\`{ first }\`). The old names stay as deprecated aliases until 0.5, so
the code works before and after. A table in @venizia/dev-configs names each moved function.

It follows a named import (aliased too) and a namespace import (\`ns.oldName(...)\`) from a module the
table lists, adds the class to that import, and drops the old name once nothing else uses it. It lists
with its file and line, and leaves for you: a call with a spread argument or the wrong number of
arguments, the old name used as a value (passed, stored, exported, in typeof), a re-export, a type-only
import, and a file that declares a name the rewrite would collide with.

  --write    write the changed files (without it, nothing is written)
  --check    dry run that exits 1 while a call can be rewritten or is left untouched (for CI)
  --help     print this text and exit

With no flag it lists what would change and writes nothing. Inside a git repository it reads the
files git knows (tracked, or untracked and not ignored), and --write refuses a file with local changes
(changed, staged or untracked): commit or stash it first, so git can undo the codemod.`;

/** A usage error: nothing was read or written. */
const USAGE_ERROR_CODE = 2;

class NamespaceFunctionsFlags {
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
 * `devz codemod namespace-functions [paths...] [--write | --check]`: rewrites the calls of the
 * functions the mapping table lists to their class form. It is a dry run unless `--write` is given.
 * `--check` is the same dry run, and exits 1 while a call can be rewritten or is left untouched.
 */
export class NamespaceFunctionsCommand {
  static readonly USAGE = USAGE;

  static async run(opts: {
    root: string;
    args: string[];
    /** The table to apply; the one this package ships by default. */
    mappings?: ReadonlyArray<INamespaceMapping>;
  }): Promise<number> {
    const { root, args, mappings = ALL_MAPPINGS } = opts;

    if (
      args.includes(NamespaceFunctionsFlags.HELP) ||
      args.includes(NamespaceFunctionsFlags.HELP_SHORT)
    ) {
      console.log(USAGE);
      return 0;
    }

    const flags = args.filter((argument) => argument.startsWith('-'));
    const paths = args.filter((argument) => !argument.startsWith('-'));

    const unknown = flags.filter((flag) => !NamespaceFunctionsFlags.isValid(flag));
    if (unknown.length > 0) {
      console.error(
        `devz codemod: unknown option ${unknown.map((flag) => `"${flag}"`).join(', ')}\n${USAGE}`,
      );
      return USAGE_ERROR_CODE;
    }

    const isWrite = flags.includes(NamespaceFunctionsFlags.WRITE);
    const isCheck = flags.includes(NamespaceFunctionsFlags.CHECK);

    if (isWrite && isCheck) {
      console.error(
        `devz codemod: ${NamespaceFunctionsFlags.WRITE} and ${NamespaceFunctionsFlags.CHECK} contradict each other\n${USAGE}`,
      );
      return USAGE_ERROR_CODE;
    }

    const problems = NamespaceMappings.validate({ mappings });
    if (problems.length > 0) {
      console.error(
        `devz codemod namespace-functions: the mapping table is broken:\n${problems.map((problem) => `  ${problem}`).join('\n')}`,
      );
      return 1;
    }

    if (mappings.length === 0) {
      console.log(
        'devz codemod namespace-functions: the mapping table of this version is empty, so there is nothing to rewrite',
      );
      return 0;
    }

    let typescript: typeof import('typescript');
    try {
      const result2 = await import('typescript');
      typescript = result2.default;
    } catch {
      console.error('devz codemod: the "typescript" package is required to read your sources');
      return 1;
    }

    // Identifiers only (the table is validated), so the names need no escaping.
    const nameText = new RegExp(
      `\\b(?:${[...new Set(mappings.map((mapping) => mapping.oldName))].join('|')})\\b`,
    );
    const targets = (paths.length > 0 ? paths : ['.']).map((path) => resolve(root, path));
    let changedCount = 0;
    let callCount = 0;
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

        if (!nameText.test(source)) {
          continue;
        }

        const shown = relative(root, file).split('\\').join('/') || file;
        const result = NamespaceFunctions.rewrite({ typescript, fileName: file, source, mappings });

        for (const report of result.reports) {
          reportCount += 1;
          console.warn(`${shown}:${report.line}:${report.column}  ${report.reason}`);
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
      `devz codemod namespace-functions: ${changedCount} file(s) ${isWrite ? 'changed' : 'would change'}, ${callCount} call(s) ${isWrite ? 'rewritten' : 'would be rewritten'}, ${reportCount} left untouched` +
        (refusedCount > 0 ? `, ${refusedCount} refused` : ''),
    );

    if (!isWrite && changedCount > 0) {
      console.log(
        `Nothing was written. Run again with ${NamespaceFunctionsFlags.WRITE} to apply, then run your typecheck and formatter.`,
      );
    }

    if (isWrite && refusedCount > 0) {
      return 1;
    }

    return isCheck && (changedCount > 0 || reportCount > 0) ? 1 : 0;
  }
}
