import './kernel-stub';
import { ArtifactScanCache } from '@/bun';
import { SpawnHelper } from '@venizia/dev-configs/testing';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { cpSync, existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/**
 * Vite runs under Node, and `@venizia/ignis-boot/vite` runs inside it: `configResolved` reads the scan cache. A
 * `Bun.CryptoHasher` in that path (0.4.7-3) threw `ReferenceError: Bun is not defined` at `ArtifactScanCache.location`,
 * and every other test here runs under Bun, where it works. So this one runs the BUILT plugin under a real `node`, twice:
 * the first run scans and writes the cache, the second reads it.
 */
const FIXTURE_APP = resolve(process.cwd(), 'src', '__tests__', 'fixtures', 'auto', 'app');
const DIST = resolve(process.cwd(), 'dist', 'esm');

let workspace = '';
let app = '';
let script = '';

const runNode = () => {
  const node = Bun.which('node');
  if (!node) {
    // A missing node must fail this test, not skip it: skipping is how the original break got through.
    throw new Error('[vite-under-node] `node` is not on the PATH | this test needs a real Node');
  }

  const result = SpawnHelper.spawnSyncBounded({
    cmd: [node, script],
    cwd: workspace,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  return {
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
};

beforeAll(() => {
  workspace = mkdtempSync(join(tmpdir(), 'ignis-vite-node-'));
  app = join(workspace, 'app');
  cpSync(FIXTURE_APP, app, { recursive: true, filter: (path) => !path.includes('app_data') });

  script = join(workspace, 'run.mjs');
  writeFileSync(
    script,
    [
      `import { ArtifactScanCache, ArtifactSources } from ${JSON.stringify(join(DIST, 'bun', 'index.js'))};`,
      `import { IgnisArtifactsVitePlugin } from ${JSON.stringify(join(DIST, 'vite', 'index.js'))};`,
      `const packageSource = ${JSON.stringify(join(app, 'src'))};`,
      `const cachedBefore = ArtifactSources.isCached({ packageSource });`,
      `const plugin = IgnisArtifactsVitePlugin.create();`,
      `plugin.configResolved({ root: ${JSON.stringify(app)} });`,
      `const rendered = plugin.load(IgnisArtifactsVitePlugin.RESOLVED_VIRTUAL);`,
      `console.log(JSON.stringify({`,
      `  cachedBefore,`,
      `  rendered: typeof rendered === 'string' ? rendered.length : 0,`,
      `  location: ArtifactScanCache.location({ root: '/srv/app/src' }),`,
      `  digest: ArtifactScanCache.digest({ text: 'xin chào /srv/app' }),`,
      `}));`,
    ].join('\n'),
  );
});

afterAll(() => {
  rmSync(workspace, { recursive: true, force: true });
});

describe('@venizia/ignis-boot/vite under a real node', () => {
  test('the first run scans and writes the cache, with no Bun and no node:crypto', () => {
    const run = runNode();

    expect(run.stderr).not.toContain('Bun is not defined');
    expect(run.exitCode).toBe(0);

    const report = JSON.parse(run.stdout.trim().split('\n').pop() ?? '{}');
    expect(report.cachedBefore).toBe(false);
    expect(report.rendered).toBeGreaterThan(0);

    const cacheDirectory = join(app, 'node_modules', '.cache', 'ignis-artifacts');
    expect(existsSync(cacheDirectory)).toBe(true);
    expect(readdirSync(cacheDirectory).every((name) => /^[0-9a-f]{16}\.json$/.test(name))).toBe(
      true,
    );
  });

  test('the second run reads the cache the first one wrote', () => {
    const run = runNode();

    expect(run.exitCode).toBe(0);
    expect(JSON.parse(run.stdout.trim().split('\n').pop() ?? '{}').cachedBefore).toBe(true);
  });

  test('Node and Bun name the same cache file and give the same hash', () => {
    const report = JSON.parse(runNode().stdout.trim().split('\n').pop() ?? '{}');

    expect(report.location).toBe(ArtifactScanCache.location({ root: '/srv/app/src' }));
    expect(report.digest).toBe(ArtifactScanCache.digest({ text: 'xin chào /srv/app' }));
  });
});

describe('ArtifactScanCache.digest', () => {
  test('is 32 hex characters, stable, and different for different text', () => {
    expect(ArtifactScanCache.digest({ text: 'abc' })).toBe('4664cddf317f7918ec487c9f600d8b09');
    expect(ArtifactScanCache.digest({ text: '' })).toBe('027ae52ecfc796215593990d4b41437c');
    expect(ArtifactScanCache.digest({ text: 'abd' })).not.toBe(
      ArtifactScanCache.digest({ text: 'abc' }),
    );
    expect(ArtifactScanCache.digest({ text: 'a'.repeat(10_000) })).toMatch(/^[0-9a-f]{32}$/);
  });
});
