import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

/** The filter vocabulary has to stay bundleable for a browser data layer, and that is a property of the RESOLVED import graph, not of a file's own source: `operators.ts` contains nothing server-side yet was dragging 13 node builtins plus `@hono/zod-openapi` and `ioredis` into a browser bundle purely by reaching `getError` through the `@venizia/ignis-helpers` root barrel. */
/** The zod schemas in `query-schemas/*` parse HTTP query strings and are deliberately NOT part of that surface - they stay Hono-coupled and server-side. Only `query-schemas/common/types.ts` crosses over, and types cost nothing at runtime. */
/** Probes bundle in a subprocess: in-process `Bun.build` under `bun test` reports spurious errors for modules other test files already loaded. */
/** Dependencies are spied at `onResolve`, not `onLoad`: the probe entry sits outside the workspace, so a bare specifier only hoisted at the repo root never resolves and would never reach `onLoad` - the leak would pass unseen. */

/** Packages a browser bundle of the filter vocabulary may pull in. */
const ALLOWED_PACKAGES = new Set(['@venizia/ignis-inversion', 'lodash', 'reflect-metadata']);

const PACKAGE_ROOT = process.cwd();
const FILTER_TYPES_ENTRY = path.join(
  PACKAGE_ROOT,
  'src/base/repositories/query-schemas/common/types.ts',
);
const OPERATORS_ENTRY = path.join(PACKAGE_ROOT, 'src/base/repositories/common/operators.ts');
const QUERY_SCHEMAS_ENTRY = path.join(PACKAGE_ROOT, 'src/base/repositories/query-schemas/index.ts');

interface IProbeReport {
  success: boolean;
  errors: Array<string>;
  builtins: Array<string>;
  packages: Array<string>;
  filesWalked: number;
}

let probeDirectory: string;

const buildProbeScript = (opts: { entryPath: string; outdirName: string }) => {
  return `
    const builtins = new Set();
    const packages = new Set();
    const files = new Set();
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
            builder.onResolve({ filter: /^node:/ }, args => {
              builtins.add(args.path);
              return { path: args.path, external: true };
            });
            builder.onResolve({ filter: /.*/ }, args => {
              const specifier = args.path;
              const isRelative = specifier.startsWith('.') || specifier.startsWith('/');
              const isPathAlias = specifier.startsWith('@/');
              if (!isRelative && !isPathAlias) {
                packages.add(toPackageName(specifier));
              }
              return undefined;
            });
            builder.onLoad({ filter: /.*/ }, args => {
              files.add(args.path);
              return undefined;
            });
          },
        },
      ],
    });
    console.log('PROBE_REPORT:' + JSON.stringify({
      success: result.success,
      errors: result.logs.filter(log => log.level === 'error').map(String),
      builtins: [...builtins].sort(),
      packages: [...packages].sort(),
      filesWalked: files.size,
    }));
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

describe('the filter vocabulary bundles for the browser', () => {
  test('the filter types resolve to nothing at all, so they stay free to share', async () => {
    const report = await probeEntry({
      name: 'filter-types',
      source: `export * from ${JSON.stringify(FILTER_TYPES_ENTRY)};\n`,
    });

    expect(report.errors).toEqual([]);
    expect(report.builtins).toEqual([]);
    expect(report.packages).toEqual([]);
  });

  test('the operator vocabulary resolves no node builtin and nothing outside the allow list', async () => {
    const report = await probeEntry({
      name: 'operators',
      source: `export * from ${JSON.stringify(OPERATORS_ENTRY)};\n`,
    });

    expect(report.errors).toEqual([]);
    expect(report.success).toBe(true);
    expect(report.builtins).toEqual([]);
    expect(report.packages.filter(name => !ALLOWED_PACKAGES.has(name))).toEqual([]);
    expect(report.filesWalked).toBeGreaterThan(50);
  });

  test('the query schemas stay server-side, which is why the types were split out of them', async () => {
    const report = await probeEntry({
      name: 'query-schemas',
      source: `export * from ${JSON.stringify(QUERY_SCHEMAS_ENTRY)};\n`,
    });

    expect(report.packages).toContain('@hono/zod-openapi');
  });
});
