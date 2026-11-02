import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PACKAGE_ROOT } from '../package-root';
import { SpawnHelper } from '@venizia/dev-configs/testing';

/**
 * `ECDH` rides `@venizia/ignis-helpers/core` so a browser can speak the server's wire format. Its size IS part of
 * that contract: a change that pulls `node:crypto`, the key-derivation code of `AES`, or the algorithms barrel
 * into the entry shows here while every behaviour test stays green. Sizes are gzipped, bundled from the built `dist`.
 */
const CORE_ENTRY = path.resolve(PACKAGE_ROOT, 'dist/esm/core.js');

/** Headroom over the measured size (8.2 KB gzip: `BaseHelper`, the logger factory, the error layer and `ECDH` itself). */
const ECDH_BUDGET = 10_240;

let probeDirectory: string;

const bundle = async (opts: { name: string; source: string }) => {
  const entryPath = path.join(probeDirectory, `${opts.name}.entry.ts`);
  const outfile = path.join(probeDirectory, `${opts.name}.bundle.js`);
  await writeFile(entryPath, opts.source);

  const build = SpawnHelper.spawnSyncBounded({
    cmd: ['bun', 'build', '--target=browser', '--minify', entryPath, '--outfile', outfile],
    cwd: PACKAGE_ROOT,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (build.exitCode !== 0) {
    throw new Error(`[ecdh-bundle-budget] bun build failed | stderr: ${build.stderr.toString()}`);
  }

  const bytes = await Bun.file(outfile).bytes();
  return { text: new TextDecoder().decode(bytes), gzip: Bun.gzipSync(bytes, { level: 9 }).length };
};

describe('ECDH from the ./core subpath', () => {
  beforeAll(async () => {
    const result = await mkdtemp(path.join(tmpdir(), 'ignis-ecdh-budget-'));
    probeDirectory = result;
  });

  afterAll(async () => {
    await rm(probeDirectory, { recursive: true, force: true });
  });

  test(`stays under ${ECDH_BUDGET} B gzip and imports nothing from node`, async () => {
    const result = await bundle({
      name: 'ecdh',
      source: `import { ECDH } from '${CORE_ENTRY}';\nglobalThis.probe = ECDH.withAlgorithm();\n`,
    });

    expect(result.gzip).toBeLessThanOrEqual(ECDH_BUDGET);
    expect(result.text).not.toMatch(/["']node:/);
  });

  test('does not carry AES or RSA: the Node-only algorithms stay behind', async () => {
    const result = await bundle({
      name: 'ecdh-only',
      source: `import { ECDH } from '${CORE_ENTRY}';\nglobalThis.probe = ECDH.withAlgorithm();\n`,
    });

    // `AES` and `RSA` are not exported from `./core`; their markers must not leak in through the shared base.
    expect(result.text).not.toContain('pbkdf2Sync');
    expect(result.text).not.toContain('createCipheriv');
    expect(result.text).not.toContain('generateKeyPairSync');
  });

  test('exports the abstract base and the ECDH types the Node entry exports', async () => {
    const core = await import(CORE_ENTRY);

    expect(typeof core.ECDH).toBe('function');
    expect(typeof core.AbstractCryptoAlgorithm).toBe('function');
    expect(Object.getPrototypeOf(core.ECDH)).toBe(core.AbstractCryptoAlgorithm);
  });
});
