#!/usr/bin/env bun
import { parseArgs } from 'node:util';
import { checkArtifactIndex, generateArtifactIndex } from './generator';

const USAGE =
  'ignis-artifacts <generate|check> [--root src] [--out src/generated/artifacts.ts] [--ignore a,b] [--export GeneratedArtifacts]';

const { positionals, values } = parseArgs({
  args: process.argv.slice(2),
  allowPositionals: true,
  options: {
    root: { type: 'string', default: 'src' },
    out: { type: 'string', default: 'src/generated/artifacts.ts' },
    ignore: { type: 'string' },
    export: { type: 'string', default: 'GeneratedArtifacts' },
  },
});

const options = {
  root: values.root,
  out: values.out,
  ignore: values.ignore
    ?.split(',')
    .map(pattern => pattern.trim())
    .filter(Boolean),
  exportName: values.export,
};

/** Exit code of the command, so the process exits in exactly one place. */
const run = (): number => {
  switch (positionals[0]) {
    case 'generate': {
      const result = generateArtifactIndex(options);
      console.log(
        `${result.written ? 'wrote' : 'up to date'} ${options.out} | ${result.artifacts.length} artifact(s)`,
      );
      return 0;
    }
    case 'check': {
      const result = checkArtifactIndex(options);
      if (result.isFresh) {
        console.log(`fresh ${options.out}`);
        return 0;
      }
      console.error(
        `stale ${options.out} - run: ignis-artifacts generate --root ${options.root} --out ${options.out}`,
      );
      return 1;
    }
    default: {
      console.error(USAGE);
      return 2;
    }
  }
};

process.exit(run());
