import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PACKAGE_ROOT } from '../package-root';

/**
 * The `./uuid` subpath exists so a browser bundle can mint an id without the error surface, the
 * constants table and the digest `UuidHelper` carries - so its size IS the contract.
 *
 * Re-exporting a version through anything that reaches `getError` puts it back over budget while
 * every other test stays green. Sizes are gzipped, bundled from the built `dist`.
 */
const UUID_ENTRY = path.resolve(PACKAGE_ROOT, 'dist/esm/uuid.js');

/**
 * Headroom over the measured size, not a guess: `uuidV4` 398 B, `uuidV7` 609 B.
 *
 * Every version is a closure from a factory, so none of them carries a base class, a logger slot or
 * a prototype chain, and importing one leaves the other two behind. A change that pushes either
 * past these ceilings is a regression worth reading, not a number to bump.
 */
const BUDGETS = {
  v4: 600,
  v7: 800,
} satisfies Record<string, number>;

let probeDirectory: string;

const gzippedSize = async (opts: { name: string; source: string }): Promise<number> => {
  const entryPath = path.join(probeDirectory, `${opts.name}.entry.ts`);
  const outfile = path.join(probeDirectory, `${opts.name}.bundle.js`);
  await writeFile(entryPath, opts.source);

  const build = Bun.spawnSync({
    cmd: ['bun', 'build', '--target=browser', '--minify', entryPath, '--outfile', outfile],
    cwd: PACKAGE_ROOT,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (build.exitCode !== 0) {
    throw new Error(`[uuid-bundle-budget] bun build failed | stderr: ${build.stderr.toString()}`);
  }

  return Bun.gzipSync(await Bun.file(outfile).bytes(), { level: 9 }).length;
};

describe('the ./uuid subpath bundle budget', () => {
  beforeAll(async () => {
    probeDirectory = await mkdtemp(path.join(tmpdir(), 'ignis-uuid-budget-'));
  });

  afterAll(async () => {
    await rm(probeDirectory, { recursive: true, force: true });
  });

  test(`uuidV4 alone stays under ${BUDGETS.v4} B gzip`, async () => {
    const size = await gzippedSize({
      name: 'v4',
      source: `import { uuidV4 } from '${UUID_ENTRY}';\nglobalThis.probe = uuidV4();\n`,
    });

    expect(size).toBeLessThanOrEqual(BUDGETS.v4);
  });

  test(`uuidV7 alone stays under ${BUDGETS.v7} B gzip`, async () => {
    const size = await gzippedSize({
      name: 'v7',
      source: `import { uuidV7 } from '${UUID_ENTRY}';\nglobalThis.probe = uuidV7();\n`,
    });

    expect(size).toBeLessThanOrEqual(BUDGETS.v7);
  });

  // v5 needs the digest and a framework error for a bad namespace, so it is allowed to be large -
  // but importing v4 must not drag it in, which is what the two budgets above actually prove.
  test('v4 does not carry v5 - the digest stays behind', async () => {
    const [v4Only, withV5] = await Promise.all([
      gzippedSize({
        name: 'shake-v4',
        source: `import { uuidV4 } from '${UUID_ENTRY}';\nglobalThis.probe = uuidV4();\n`,
      }),
      gzippedSize({
        name: 'shake-v5',
        source: `import { uuidV4, uuidV5, UuidNamespaces } from '${UUID_ENTRY}';\nglobalThis.probe = [uuidV4(), uuidV5({ namespace: UuidNamespaces.DNS, name: 'x' })];\n`,
      }),
    ]);

    expect(withV5).toBeGreaterThan(v4Only * 4);
  });
});
