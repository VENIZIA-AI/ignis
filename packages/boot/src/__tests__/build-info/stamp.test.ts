import { BuildInfoEnvironmentKeys, BuildInfoStamp } from '@/build-info';
import { BuildInfoRegistry } from '@venizia/ignis-helpers/core';
import { afterAll, afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/** A CI runner exports the resolver's variables for real; clear them before each test, restore them after. */
const ENV_KEYS = [
  ...BuildInfoEnvironmentKeys.VERSION,
  ...BuildInfoEnvironmentKeys.COMMIT,
  ...BuildInfoEnvironmentKeys.BRANCH,
  ...BuildInfoEnvironmentKeys.BUILT_AT,
];
const inherited = new Map(ENV_KEYS.map((key) => [key, process.env[key]]));

/** Pins the three fields the resolver reads from the environment, so a test never depends on this checkout's git state. */
const pinEnvironment = (): void => {
  process.env.APP_BUILD_COMMIT = 'feedfacecafe';
  process.env.APP_BUILD_BRANCH = 'pinned';
  process.env.APP_BUILD_DATE = '2026-02-02T00:00:00.000Z';
};

const BAKED = {
  service: '@acme/svc',
  version: '1.2.3',
  commit: 'abc123def456',
  branch: 'release',
  builtAt: '2026-01-01T00:00:00.000Z',
};

beforeEach(() => {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
});

afterEach(() => {
  BuildInfoRegistry.clear();
  Reflect.deleteProperty(globalThis, BuildInfoStamp.GLOBAL_NAME);
});

afterAll(() => {
  for (const [key, value] of inherited) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

describe('BuildInfoStamp.register', () => {
  test('registers the stamp the compile baked into the binary', async () => {
    Object.assign(globalThis, { [BuildInfoStamp.GLOBAL_NAME]: BAKED });
    pinEnvironment();

    await BuildInfoStamp.register();

    expect(BuildInfoRegistry.get()).toEqual({
      commit: 'abc123def456',
      branch: 'release',
      builtAt: '2026-01-01T00:00:00.000Z',
    });
  });

  test('without a baked stamp it resolves the stamp from the resolver', async () => {
    pinEnvironment();

    await BuildInfoStamp.register();

    expect(BuildInfoRegistry.get()).toEqual({
      commit: 'feedfacecafe',
      branch: 'pinned',
      builtAt: '2026-02-02T00:00:00.000Z',
    });
  });

  test('from a git checkout it registers a real commit, branch and time', async () => {
    await BuildInfoStamp.register();

    const stamp = BuildInfoRegistry.get();
    expect(stamp?.commit).toMatch(/^[0-9a-f]{12}$/);
    expect(stamp?.branch).toBeTruthy();
    expect(Number.isNaN(Date.parse(stamp?.builtAt ?? ''))).toBe(false);
  });

  /** The health reporter prefers a registered service or version over `getAppInfo()`, so the stamp must leave them out. */
  test('leaves service and version to the application', async () => {
    Object.assign(globalThis, { [BuildInfoStamp.GLOBAL_NAME]: BAKED });

    await BuildInfoStamp.register();

    expect(Object.keys(BuildInfoRegistry.get() ?? {}).sort()).toEqual([
      'branch',
      'builtAt',
      'commit',
    ]);
  });
});

describe('BuildInfoStamp.define', () => {
  test('returns the resolved stamp under the baked name, JSON-encoded', async () => {
    pinEnvironment();

    const define = await BuildInfoStamp.define();

    expect(Object.keys(define)).toEqual([BuildInfoStamp.GLOBAL_NAME]);
    const stamp = JSON.parse(define[BuildInfoStamp.GLOBAL_NAME] ?? '');
    expect(stamp.commit).toBe('feedfacecafe');
    expect(stamp.branch).toBe('pinned');
    expect(stamp.builtAt).toBe('2026-02-02T00:00:00.000Z');
  });
});

/** The proof that `define()` and `register()` agree on the name: bundle an entrypoint, run it, read what the registry holds. */
describe('a bundle compiled with BuildInfoStamp.define', () => {
  const ENTRY = resolve(process.cwd(), 'src', '__tests__', 'fixtures', 'stamp', 'entry.ts');
  const workspace = mkdtempSync(join(tmpdir(), 'ignis-stamp-'));

  afterAll(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  const bundleAndRun = async (opts: { name: string; define?: Record<string, string> }) => {
    const outdir = join(workspace, opts.name);
    const built = await Bun.build({
      entrypoints: [ENTRY],
      target: 'bun',
      outdir,
      define: opts.define,
      throw: false,
    });
    expect(built.success).toBe(true);

    const result = Bun.spawnSync([process.execPath, join(outdir, 'entry.js')], {
      cwd: tmpdir(),
      env: { ...process.env, APP_BUILD_COMMIT: '0123456789ab', APP_BUILD_BRANCH: 'runtime' },
    });
    // The entry prints the registry as its last line; a debug log from the resolver may come before it.
    const lines = result.stdout.toString().trim().split('\n');
    return JSON.parse(lines[lines.length - 1] ?? '');
  };

  test('carries the stamp it was compiled with, ignoring the run environment', async () => {
    pinEnvironment();

    const result = await BuildInfoStamp.define();
    const stamp = await bundleAndRun({ name: 'baked', define: result });

    expect(stamp.commit).toBe('feedfacecafe');
    expect(stamp.branch).toBe('pinned');
    expect(stamp.builtAt).toBe('2026-02-02T00:00:00.000Z');
  });

  test('compiled without define it resolves at start', async () => {
    const stamp = await bundleAndRun({ name: 'plain' });

    expect(stamp.commit).toBe('0123456789ab');
    expect(stamp.branch).toBe('runtime');
  });
});
