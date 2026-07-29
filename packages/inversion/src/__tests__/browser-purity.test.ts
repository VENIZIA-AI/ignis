import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

/** Purity is a property of the RESOLVED import graph, never of a file's own source - a module that imports nothing server-side is still unusable in a browser if its barrel drags one in. Bundling rather than reading source is what makes `exports` maps and re-export chains count. */
/** Probes bundle in a subprocess: in-process `Bun.build` under `bun test` reports spurious errors for modules other test files already loaded. */
/** The probe runs with cwd at the package root so tsconfig `paths` (`@/*`) resolve - running it from the temp directory silently stops the walk at the first aliased import. */
/** Dependencies are spied at `onResolve`, not `onLoad`: the probe entry sits outside the workspace, so a bare specifier that is only hoisted at the repo root never resolves and would never reach `onLoad` - the leak would pass unseen. `onResolve` fires on the specifier itself, before resolution can fail. */

/** Packages a browser bundle of this package is allowed to pull in. Anything else is a regression, so a new server-side dependency fails here rather than at a consumer's bundler. */
const ALLOWED_PACKAGES = new Set(['lodash', 'reflect-metadata']);

const PACKAGE_ROOT = process.cwd();

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

const runProbe = async (opts: { name: string; script: string }): Promise<IProbeReport> => {
  const scriptPath = path.join(probeDirectory, `${opts.name}.ts`);
  await writeFile(scriptPath, opts.script);

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

const probeEntry = async (opts: { name: string; source: string }): Promise<IProbeReport> => {
  const entryPath = path.join(probeDirectory, `${opts.name}-entry.ts`);
  await writeFile(entryPath, opts.source);

  return runProbe({
    name: `${opts.name}-probe`,
    script: buildProbeScript({ entryPath, outdirName: `out-${opts.name}` }),
  });
};

beforeAll(async () => {
  probeDirectory = await mkdtemp(path.join(tmpdir(), 'ignis-browser-purity-'));
});

afterAll(async () => {
  await rm(probeDirectory, { recursive: true, force: true });
});

describe('inversion bundles for the browser', () => {
  test('the root barrel resolves no node builtin and no package outside the allow list', async () => {
    const barrelPath = path.join(PACKAGE_ROOT, 'src/index.ts');
    const report = await probeEntry({
      name: 'root-barrel',
      source: `export * from ${JSON.stringify(barrelPath)};\n`,
    });

    expect(report.errors).toEqual([]);
    expect(report.success).toBe(true);
    expect(report.builtins).toEqual([]);
    expect(report.packages.filter(name => !ALLOWED_PACKAGES.has(name))).toEqual([]);
  });

  test('the probe walks the whole package, so an empty walk cannot pass as pure', async () => {
    const barrelPath = path.join(PACKAGE_ROOT, 'src/index.ts');
    const report = await probeEntry({
      name: 'walk-depth',
      source: `export * from ${JSON.stringify(barrelPath)};\n`,
    });

    expect(report.filesWalked).toBeGreaterThan(20);
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
