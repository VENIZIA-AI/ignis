import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * Two bundler behaviors this package must survive, both proved with the `bun build` CLI in a
 * subprocess (the CLI is what `--compile` runs, and in-process `Bun.build()` under `bun test`
 * reports spurious errors for modules other test files already loaded):
 * - a dynamic `import('./x')` of our own module makes bun wrap every module it reaches in a lazy
 *   initializer, and the root barrel then exports `undefined` for `Environment` and friends;
 * - `process.env.NODE_ENV` is rewritten to a literal at build time, so a runtime `NODE_ENV` must be
 *   read through `Environment.ambient`.
 */
const PACKAGE_ROOT = process.cwd();
const BARREL_PATH = path.resolve(PACKAGE_ROOT, 'src/index.ts');

let probeDirectory: string;

const runBundled = async (opts: {
  name: string;
  entrySource: string;
  env?: Record<string, string>;
}): Promise<string> => {
  const entryPath = path.join(probeDirectory, `${opts.name}.entry.ts`);
  const outfile = path.join(probeDirectory, `${opts.name}.bundle.js`);
  await writeFile(entryPath, opts.entrySource);

  // cwd is the package: the barrel's `@/` imports resolve through this package's tsconfig.
  const build = Bun.spawnSync({
    cmd: ['bun', 'build', '--target=bun', entryPath, '--outfile', outfile],
    cwd: PACKAGE_ROOT,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (build.exitCode !== 0) {
    throw new Error(`[bundle-safe-reads] bun build failed | stderr: ${build.stderr.toString()}`);
  }

  const inherited = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => key !== 'NODE_ENV'),
  );
  const run = Bun.spawnSync({
    cmd: ['bun', outfile],
    cwd: probeDirectory,
    env: { ...inherited, ...opts.env },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const line = run.stdout
    .toString()
    .split('\n')
    .find(text => text.startsWith('RESULT:'));
  if (!line) {
    throw new Error(
      `[bundle-safe-reads] bundle emitted no result | stderr: ${run.stderr.toString()}`,
    );
  }
  return line.slice('RESULT:'.length);
};

beforeAll(async () => {
  probeDirectory = await mkdtemp(path.join(tmpdir(), 'ignis-bundle-safe-reads-'));
});

afterAll(async () => {
  await rm(probeDirectory, { recursive: true, force: true });
});

describe('the root barrel survives bun build', () => {
  test('Environment, applicationEnvironment and LoggerFactory are defined in a bundle of the barrel', async () => {
    const result = await runBundled({
      name: 'barrel-exports',
      entrySource:
        `import { Environment, applicationEnvironment, LoggerFactory } from ${JSON.stringify(BARREL_PATH)};\n` +
        `console.log('RESULT:' + JSON.stringify({ production: Environment.PRODUCTION, applicationEnvironment: typeof applicationEnvironment, loggerFactory: typeof LoggerFactory }));\n`,
    });

    expect(JSON.parse(result)).toEqual({
      production: 'production',
      applicationEnvironment: 'object',
      loggerFactory: 'function',
    });
  });
});

describe('NODE_ENV stays a runtime read', () => {
  test('Environment.ambient and Environment.current report the process value, not a build-time literal', async () => {
    const entrySource =
      `import { Environment } from ${JSON.stringify(BARREL_PATH)};\n` +
      `console.log('RESULT:' + JSON.stringify({ ambient: Environment.ambient ?? null, current: Environment.current }));\n`;

    const staging = await runBundled({
      name: 'ambient-staging',
      entrySource,
      env: { NODE_ENV: 'staging' },
    });
    expect(JSON.parse(staging)).toEqual({ ambient: 'staging', current: 'staging' });

    const unset = await runBundled({ name: 'ambient-unset', entrySource });
    expect(JSON.parse(unset)).toEqual({ ambient: null, current: 'development' });
  });

  test('positive control: a bare process.env.NODE_ENV read IS folded to a literal by bun build', async () => {
    const result = await runBundled({
      name: 'bare-read',
      entrySource: `console.log('RESULT:' + JSON.stringify({ bare: process.env.NODE_ENV ?? null }));\n`,
      env: { NODE_ENV: 'staging' },
    });

    // The literal is the BUILD machine's NODE_ENV (bun test sets `test`; a CI box usually has none,
    // giving `development`) - never the value the process was started with.
    const { bare } = JSON.parse(result) as { bare: string | null };
    expect(bare).not.toBe('staging');
    expect(bare).toBe(process.env.NODE_ENV ?? 'development');
  });
});
