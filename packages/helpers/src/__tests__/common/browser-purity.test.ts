import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

/** The root barrel is `export * from './modules'`, so reaching one constant through it drags winston, ioredis, hono and 14 node builtins into a browser bundle. `./common` is the sub-path that carries the already-pure surface - `HTTP`, `TConstValue`, the redaction and constant tables - for browser consumers and for isomorphic packages built on top of this one. */
/** Purity is a property of the RESOLVED import graph, never of a file's own source. Bundling rather than reading source is what makes `exports` maps and re-export chains count. */
/** Probes bundle in a subprocess: in-process `Bun.build` under `bun test` reports spurious errors for modules other test files already loaded. */
/** Dependencies are spied at `onResolve`, not `onLoad`: the probe entry sits outside the workspace, so a bare specifier only hoisted at the repo root never resolves and would never reach `onLoad` - the leak would pass unseen. */

/** Packages a browser bundle of the `./common` sub-path may pull in. The error layer is deliberately absent: `getError` and friends live in `@venizia/ignis-inversion`, which browser consumers import directly. */
const ALLOWED_PACKAGES = new Set(['@venizia/ignis-inversion', 'lodash', 'reflect-metadata']);

const PACKAGE_ROOT = process.cwd();
const COMMON_ENTRY = path.join(PACKAGE_ROOT, 'src/common/index.ts');
const ROOT_BARREL_ENTRY = path.join(PACKAGE_ROOT, 'src/index.ts');

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
  probeDirectory = await mkdtemp(path.join(tmpdir(), 'ignis-helpers-purity-'));
});

afterAll(async () => {
  await rm(probeDirectory, { recursive: true, force: true });
});

describe('the ./common sub-path bundles for the browser', () => {
  test('it resolves no node builtin and no package outside the allow list', async () => {
    const report = await probeEntry({
      name: 'common',
      source: `export * from ${JSON.stringify(COMMON_ENTRY)};\n`,
    });

    expect(report.errors).toEqual([]);
    expect(report.success).toBe(true);
    expect(report.builtins).toEqual([]);
    expect(report.packages.filter(name => !ALLOWED_PACKAGES.has(name))).toEqual([]);
  });

  test('the probe walks the whole surface, so an empty walk cannot pass as pure', async () => {
    const report = await probeEntry({
      name: 'walk-depth',
      source: `export * from ${JSON.stringify(COMMON_ENTRY)};\n`,
    });

    expect(report.filesWalked).toBeGreaterThan(50);
  });

  test('the exports map publishes it, so the sub-path a consumer imports is the one measured', async () => {
    const manifest = JSON.parse(
      await readFile(path.join(PACKAGE_ROOT, 'package.json'), 'utf8'),
    ) as { exports: Record<string, { types: string; default: string }> };

    expect(manifest.exports['./common']).toEqual({
      types: './dist/common/index.d.ts',
      default: './dist/common/index.js',
    });
  });

  test('control: the root barrel is NOT browser-safe, which is why the sub-path exists', async () => {
    const report = await probeEntry({
      name: 'root-barrel',
      source: `export * from ${JSON.stringify(ROOT_BARREL_ENTRY)};\n`,
    });

    expect(report.builtins).toContain('node:fs');
    expect(report.packages).toContain('ioredis');
  });
});
