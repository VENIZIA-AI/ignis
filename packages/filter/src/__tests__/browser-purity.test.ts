import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

/** This package exists to be isomorphic: the same filter language on a server repository and in a browser data layer. That is a property of the RESOLVED import graph, not of a file's own source, so it is measured by bundling rather than by reading imports. Before the extraction this vocabulary pulled 13 node builtins plus `@hono/zod-openapi` and `ioredis` - purely by reaching `getError` through a barrel. */
/** Probes bundle in a subprocess: in-process `Bun.build` under `bun test` reports spurious errors for modules other test files already loaded. */
/** Dependencies are spied at `onResolve`, not `onLoad`: the probe entry sits outside the workspace, so a bare specifier only hoisted at the repo root never resolves and would never reach `onLoad` - the leak would pass unseen. */
/** The probe runs with cwd at the package root, or tsconfig `paths` (`@/*`) do not resolve and the walk stops at the first aliased import, reporting a false clean. */
/** `@venizia/ignis-inversion` resolves here through its `exports` map, which points only at `dist/` - so this gate measures what inversion ships, not what its source says. `make purity-filter` forces a fresh inversion build first; running this file's `bun test` directly does not, and will report a false pass against a stale `dist/`. */

/** Everything a browser bundle of the ROOT barrel may pull in. `@venizia/ignis-inversion` supplies `getError` and `TConstValue`; the other two arrive through it. Adding to this set is a deliberate act - it widens what a consumer must ship. */
const ALLOWED_PACKAGES = new Set(['@venizia/ignis-inversion', 'lodash', 'reflect-metadata']);

/** The `./schemas` sub-path adds `zod` and nothing else. It is a separate entry point precisely so the vocabulary alone does not drag a validator in - and so `@hono/zod-openapi` can never follow the schemas across, which is what would break a browser build. */
const ALLOWED_SCHEMA_PACKAGES = new Set([...ALLOWED_PACKAGES, 'zod']);

const PACKAGE_ROOT = process.cwd();
const BARREL_ENTRY = path.join(PACKAGE_ROOT, 'src/index.ts');
const TYPES_ENTRY = path.join(PACKAGE_ROOT, 'src/common/types.ts');
const SCHEMAS_ENTRY = path.join(PACKAGE_ROOT, 'src/schemas/index.ts');

interface IProbeReport {
  success: boolean;
  errors: Array<string>;
  builtins: Array<string>;
  packages: Array<string>;
  globals: Array<string>;
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
    // Only these three break a browser. \`Buffer\` and \`global\` are deliberately absent: lodash declares its own local \`Buffer\` and guards \`global\` behind \`typeof\`, so both are browser-safe and would be permanent false positives.
    const NODE_ONLY_GLOBALS = ['process', '__dirname', '__filename'];
    const globals = new Set();
    for (const artifact of result.outputs) {
      const text = await artifact.text();
      for (const name of NODE_ONLY_GLOBALS) {
        // Word-boundary match so \`processRequest\` or \`globalThis\` never counts.
        if (new RegExp('(?<![$\\\\w.])' + name + '(?![$\\\\w])').test(text)) {
          globals.add(name);
        }
      }
    }
    console.log('PROBE_REPORT:' + JSON.stringify({
      success: result.success,
      errors: result.logs.filter(log => log.level === 'error').map(String),
      builtins: [...builtins].sort(),
      packages: [...packages].sort(),
      globals: [...globals].sort(),
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
  probeDirectory = await mkdtemp(path.join(tmpdir(), 'ignis-filter-purity-'));
});

afterAll(async () => {
  await rm(probeDirectory, { recursive: true, force: true });
});

describe('the filter vocabulary bundles for the browser', () => {
  test('the root barrel resolves no node builtin and nothing outside the allow list', async () => {
    const report = await probeEntry({
      name: 'barrel',
      source: `export * from ${JSON.stringify(BARREL_ENTRY)};\n`,
    });

    expect(report.errors).toEqual([]);
    expect(report.success).toBe(true);
    expect(report.builtins).toEqual([]);
    expect(report.packages.filter(name => !ALLOWED_PACKAGES.has(name))).toEqual([]);
  });

  test('the probe walks the whole graph, so an empty walk cannot pass as pure', async () => {
    const report = await probeEntry({
      name: 'walk-depth',
      source: `export * from ${JSON.stringify(BARREL_ENTRY)};\n`,
    });

    expect(report.filesWalked).toBeGreaterThan(20);
  });

  test('the filter shape resolves to nothing at all, so it costs a bundle zero', async () => {
    const report = await probeEntry({
      name: 'types',
      source: `export * from ${JSON.stringify(TYPES_ENTRY)};\n`,
    });

    expect(report.builtins).toEqual([]);
    expect(report.packages).toEqual([]);
  });

  test('the schemas sub-path adds zod and never lets the OpenAPI layer follow them across', async () => {
    const report = await probeEntry({
      name: 'schemas',
      source: `export * from ${JSON.stringify(SCHEMAS_ENTRY)};\n`,
    });

    expect(report.errors).toEqual([]);
    expect(report.success).toBe(true);
    expect(report.builtins).toEqual([]);
    expect(report.packages.filter(name => !ALLOWED_SCHEMA_PACKAGES.has(name))).toEqual([]);
    expect(report.packages).not.toContain('@hono/zod-openapi');
    expect(report.packages).not.toContain('hono');
  });

  test('the root barrel does not drag zod in - that is why schemas are a separate entry', async () => {
    const report = await probeEntry({
      name: 'barrel-no-zod',
      source: `export * from ${JSON.stringify(BARREL_ENTRY)};\n`,
    });

    expect(report.packages).not.toContain('zod');
  });

  test('positive control: a node builtin and a server-only package are both caught', async () => {
    const report = await probeEntry({
      name: 'positive-control',
      source:
        `import { readFileSync } from 'node:fs';\n` +
        `import Redis from 'ioredis';\n` +
        `export const probe = () => readFileSync('/dev/null') && Redis;\n`,
    });

    expect(report.builtins).toContain('node:fs');
    expect(report.packages).toContain('ioredis');
  });

  test('the root barrel leaves no node-only global in the emitted bundle', async () => {
    const barrelPath = path.join(PACKAGE_ROOT, 'src/index.ts');
    const report = await probeEntry({
      name: 'globals',
      source: `export * from ${JSON.stringify(barrelPath)};\n`,
    });

    expect(report.errors).toEqual([]);
    expect(report.success).toBe(true);
    expect(report.globals).toEqual([]);
  });

  test('positive control: a node-only global is caught', async () => {
    const report = await probeEntry({
      name: 'globals-positive-control',
      source: `export const probe = () => process.env.SOME_FLAG ?? __dirname;\n`,
    });

    expect(report.globals).toContain('process');
    expect(report.globals).toContain('__dirname');
  });
});
