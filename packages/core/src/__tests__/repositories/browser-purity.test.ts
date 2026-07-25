import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { QueryOperators, Sorts } from '@/base/repositories';

/** The filter vocabulary itself moved to `@venizia/ignis-filter`, which guards its own purity. Two things stay this package's responsibility: the HTTP query schemas must NOT follow it across (they parse query strings and pull the OpenAPI layer, which is a server concern), and the re-export that keeps every existing `@venizia/ignis-core` import resolving must not silently break. */
/** Probes bundle in a subprocess: in-process `Bun.build` under `bun test` reports spurious errors for modules other test files already loaded. */

const PACKAGE_ROOT = process.cwd();
const QUERY_SCHEMAS_ENTRY = path.join(PACKAGE_ROOT, 'src/base/repositories/query-schemas/index.ts');

interface IProbeReport {
  packages: Array<string>;
}

let probeDirectory: string;

const buildProbeScript = (opts: { entryPath: string; outdirName: string }) => {
  return `
    const packages = new Set();
    const toPackageName = specifier => {
      const segments = specifier.split('/');
      return specifier.startsWith('@') ? segments.slice(0, 2).join('/') : segments[0];
    };
    const result = await Bun.build({
      entrypoints: [${JSON.stringify(opts.entryPath)}],
      target: 'browser',
      outdir: ${JSON.stringify(path.join(probeDirectory, opts.outdirName))},
      throw: false,
      plugins: [
        {
          name: 'browser-purity-spy',
          setup: builder => {
            builder.onResolve({ filter: /.*/ }, args => {
              const specifier = args.path;
              const isRelative = specifier.startsWith('.') || specifier.startsWith('/');
              const isPathAlias = specifier.startsWith('@/');
              if (!isRelative && !isPathAlias && !specifier.startsWith('node:')) {
                packages.add(toPackageName(specifier));
              }
              return undefined;
            });
          },
        },
      ],
    });
    console.log('PROBE_REPORT:' + JSON.stringify({ packages: [...packages].sort() }));
  `;
};

const probeEntry = async (opts: { name: string; source: string }): Promise<IProbeReport> => {
  const entryPath = path.join(probeDirectory, `${opts.name}-entry.ts`);
  await writeFile(entryPath, opts.source);

  const scriptPath = path.join(probeDirectory, `${opts.name}-probe.ts`);
  await writeFile(scriptPath, buildProbeScript({ entryPath, outdirName: `out-${opts.name}` }));

  const result = Bun.spawnSync({
    cmd: ['bun', scriptPath],
    cwd: PACKAGE_ROOT,
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const stdout = result.stdout.toString();
  const marker = stdout.split('\n').find(line => line.startsWith('PROBE_REPORT:'));
  if (!marker) {
    throw new Error(
      `[browser-purity] probe emitted no report | stdout: ${stdout} | stderr: ${result.stderr.toString()}`,
    );
  }

  return JSON.parse(marker.slice('PROBE_REPORT:'.length)) as IProbeReport;
};

beforeAll(async () => {
  probeDirectory = await mkdtemp(path.join(tmpdir(), 'ignis-core-purity-'));
});

afterAll(async () => {
  await rm(probeDirectory, { recursive: true, force: true });
});

describe('the filter boundary between core and @venizia/ignis-filter', () => {
  test('the query schemas stay server-side, which is why the vocabulary was split out of them', async () => {
    const report = await probeEntry({
      name: 'query-schemas',
      source: `export * from ${JSON.stringify(QUERY_SCHEMAS_ENTRY)};\n`,
    });

    expect(report.packages).toContain('@hono/zod-openapi');
  });

  test('the vocabulary is still reachable from this package, so no consumer import broke', () => {
    expect(QueryOperators.isValid(QueryOperators.EQ)).toBe(true);
    expect(Sorts.isValid(Sorts.DESC)).toBe(true);
  });
});
