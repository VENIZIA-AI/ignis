#!/usr/bin/env bun
import { CleanCommand } from './clean';
import { LintCommand } from './lint';

const USAGE = 'Usage: devz lint [--fix] [files] | devz clean';

const main = async (opts: { argv: string[] }): Promise<number> => {
  const [command, ...args] = opts.argv;

  if (command === 'lint') {
    return LintCommand.run({ root: process.cwd(), args });
  }

  if (command === 'clean') {
    return CleanCommand.run({ root: process.cwd() });
  }

  console.error(`devz: unknown command "${command ?? ''}"\n${USAGE}`);
  return 1;
};

main({ argv: process.argv.slice(2) }).then(
  exitCode => process.exit(exitCode),
  (error: unknown) => {
    console.error(error);
    process.exit(1);
  },
);
