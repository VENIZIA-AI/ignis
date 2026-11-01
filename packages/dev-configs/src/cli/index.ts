#!/usr/bin/env bun
import { CheckCommand } from './check';
import { CleanCommand } from './clean';
import { CodemodCommand } from './codemod';
import { LintCommand } from './lint';

const USAGE = `Usage: devz <command> [options]

Commands:
  lint [--fix] [files]                          oxlint, ESLint and the formatter; --fix writes
  check purity --claims <file> [package] [--json]  probe every entry claimed browser-pure (needs a build)
  check module-cycles | split-report | catalog   shared repository gates; devz check --help lists their options
  clean                                         remove dist, node_modules/.cache and *.tsbuildinfo
  codemod model-settings [paths...] [--write]   move @model settings to the grouped shape (dry run unless --write)
  codemod drop-redundant-casts [paths...]       remove \`as X\` casts the compiler no longer needs (dry run unless --write)
  codemod const-classes [paths...]              turn a string-literal union into a const class (dry run unless --write)
  codemod async-style [paths...]                apply the no-inline-await and no-return-await fixers (dry run unless --write)
  codemod namespace-functions [paths...]        move calls of a function that moved into a class to the class form (dry run unless --write)

Run \`devz clean --help\` or \`devz codemod --help\` for a command's options.`;

const main = async (opts: { argv: string[] }): Promise<number> => {
  const [command, ...args] = opts.argv;

  if (command === undefined || command === '--help' || command === '-h') {
    console.log(USAGE);
    return 0;
  }

  if (command === 'lint') {
    return LintCommand.run({ root: process.cwd(), args });
  }

  if (command === 'check') {
    return CheckCommand.run({ root: process.cwd(), args });
  }

  if (command === 'clean') {
    return CleanCommand.run({ root: process.cwd(), args });
  }

  if (command === 'codemod') {
    return CodemodCommand.run({ root: process.cwd(), args });
  }

  console.error(`devz: unknown command "${command ?? ''}"\n${USAGE}`);
  return 1;
};

main({ argv: process.argv.slice(2) }).then(
  (exitCode) => process.exit(exitCode),
  (error: unknown) => {
    console.error(error);
    process.exit(1);
  },
);
