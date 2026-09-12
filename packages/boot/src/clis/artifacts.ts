#!/usr/bin/env bun
import '../common/install-quiet-logger';
import { relative } from 'node:path';
import { parseArgs } from 'node:util';
import { checkArtifactIndex, generateArtifactIndex } from '../generator';
import type { IScannedArtifact } from '../generator';

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

/** One stderr line per decorated class a user `--ignore` pattern hid; silence when nothing is hidden. */
const warnIgnored = (opts: { ignored: IScannedArtifact[]; root: string }): void => {
  for (const artifact of opts.ignored) {
    console.error(
      `warning: ${artifact.className} (${artifact.type}) in ${relative(opts.root, artifact.filePath)} matches --ignore and is left out of the index`,
    );
  }
};

/** Exit code of the command, so the process exits in exactly one place. */
const run = (): number => {
  switch (positionals[0]) {
    case 'generate': {
      const result = generateArtifactIndex(options);
      console.log(
        `${result.written ? 'wrote' : 'up to date'} ${options.out} | ${result.artifacts.length} artifact(s)`,
      );
      warnIgnored({ ignored: result.ignored, root: options.root });
      return 0;
    }
    case 'check': {
      const result = checkArtifactIndex(options);
      warnIgnored({ ignored: result.ignored, root: options.root });
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
