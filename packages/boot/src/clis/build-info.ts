#!/usr/bin/env bun
import '../common/install-quiet-logger';
import { parseArgs } from 'node:util';
import { BuildInfoEmitter, BuildInfoFormats, generateBuildInfo } from '../build-info';

const USAGE =
  'ignis-build-info generate [--out src/_build_info.ts] [--root .] [--format ts|json] [--export BUILD_INFO]';

const { positionals, values } = parseArgs({
  args: process.argv.slice(2),
  allowPositionals: true,
  options: {
    out: { type: 'string', default: 'src/_build_info.ts' },
    root: { type: 'string', default: '.' },
    format: { type: 'string', default: BuildInfoFormats.TS },
    export: { type: 'string', default: BuildInfoEmitter.DEFAULT_EXPORT_NAME },
  },
});

/** Exit code of the command, so the process exits in exactly one place. */
const run = async (): Promise<number> => {
  if (positionals[0] !== 'generate') {
    console.error(USAGE);
    return 1;
  }

  if (!BuildInfoFormats.isValid(values.format)) {
    console.error(
      `invalid --format '${values.format}' | expected one of: ${[...BuildInfoFormats.SCHEME_SET].join(', ')}`,
    );
    return 1;
  }

  // Narrowed by comparison, never asserted: `isValid` above already refused everything else.
  const format =
    values.format === BuildInfoFormats.JSON ? BuildInfoFormats.JSON : BuildInfoFormats.TS;

  const result = await generateBuildInfo({
    out: values.out,
    root: values.root,
    format,
    exportName: values.export,
  });

  const { service, version, commit, branch } = result.buildInfo;
  console.log(`wrote ${values.out} | ${service}@${version} | ${commit} (${branch})`);

  return 0;
};

run()
  .then(code => {
    process.exit(code);
  })
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
