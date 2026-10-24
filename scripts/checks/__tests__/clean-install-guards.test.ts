import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  checkImportOrder,
  findStrayModuleRoots,
  findUnmatchedBrowserEntries,
  findUnpinnedWorkspaceEntries,
  isBuildStale,
} from '../clean-install/cli';
import type { IInstallRow } from '../clean-install/manifest';

const TARBALL = '/tmp/gate/tarballs/kernel/venizia-ignis-kernel-0.2.0-44.tgz';
const HELPERS_TARBALL = '/tmp/gate/tarballs/helpers/venizia-ignis-helpers-0.2.0-39.tgz';

const ORDER_ROW: IInstallRow = {
  package: 'probe',
  name: 'probe',
  subpath: '.',
  specifier: './counted.mjs',
  extras: [],
  bunOnly: true,
  hasRequire: false,
  importedAfter: ['./peer.mjs'],
};

/** The row's entry counts its loads in `runs.txt` and fails on load `failOnRun`, as a load race fails only some runs. */
const writeOrderFixture = (opts: { sandbox: string; failOnRun?: number }): void => {
  writeFileSync(
    join(opts.sandbox, 'counted.mjs'),
    [
      "import { existsSync, readFileSync, writeFileSync } from 'node:fs';",
      "const counter = new URL('./runs.txt', import.meta.url);",
      "const run = existsSync(counter) ? Number(readFileSync(counter, 'utf8')) + 1 : 1;",
      'writeFileSync(counter, String(run));',
      `if (run === ${opts.failOnRun ?? 0}) {`,
      // Not console.error: under FORCE_COLOR Bun wraps it in color codes.
      "  process.stderr.write('error: load failed on run ' + run + '\\n');",
      '  process.exit(1);',
      '}',
      '',
    ].join('\n'),
  );
  writeFileSync(join(opts.sandbox, 'peer.mjs'), 'export const peer = true;\n');
};

const lockWith = (opts: { kernel: string; helpers: string }): string => `{
  "lockfileVersion": 2,
  "configVersion": 1,
  "packages": {
    "@venizia/ignis-helpers": [${opts.helpers}, { "dependencies": { "zod": "^4.5.4" } }, "sha512-a=="],

    "@venizia/ignis-kernel": [${opts.kernel}, { "dependencies": { "@venizia/ignis-helpers": "^0.2.0-39" } }, "sha512-b=="],

    "hono": ["hono@4.13.8", "", {}, "sha512-c=="],
  }
}
`;

describe('clean-install guards', () => {
  const scratch: string[] = [];
  afterEach(() => {
    for (const directory of scratch.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test('an ancestor node_modules above the gate root is refused', () => {
    const ancestor = mkdtempSync(join(tmpdir(), 'ign-stray-'));
    scratch.push(ancestor);
    const root = join(ancestor, 'a', 'gate-root');
    mkdirSync(root, { recursive: true });

    expect(findStrayModuleRoots({ root })).not.toContain(join(ancestor, 'node_modules'));

    mkdirSync(join(ancestor, 'node_modules'));
    expect(findStrayModuleRoots({ root })).toContain(join(ancestor, 'node_modules'));
  });

  test('NODE_PATH and the home-folder module roots are refused', () => {
    const home = mkdtempSync(join(tmpdir(), 'ign-home-'));
    scratch.push(home);
    const root = join(home, 'gate-root');

    expect(findStrayModuleRoots({ root, home, nodePath: '' })).not.toContain(
      join(home, '.node_modules'),
    );

    mkdirSync(join(home, '.node_modules'));
    const found = findStrayModuleRoots({ root, home, nodePath: '/opt/lib:/srv/lib' });
    expect(found).toContain(join(home, '.node_modules'));
    expect(found).toContain('NODE_PATH=/opt/lib');
    expect(found).toContain('NODE_PATH=/srv/lib');
  });

  test('a lock whose @venizia entries resolve to the packed tarballs passes', () => {
    const lock = lockWith({
      kernel: `"@venizia/ignis-kernel@${TARBALL}"`,
      helpers: `"@venizia/ignis-helpers@${HELPERS_TARBALL}"`,
    });
    const tarballs = new Map([
      ['@venizia/ignis-kernel', TARBALL],
      ['@venizia/ignis-helpers', HELPERS_TARBALL],
    ]);

    expect(
      findUnpinnedWorkspaceEntries({ lock, tarballs, package: '@venizia/ignis-kernel' }),
    ).toEqual([]);
  });

  test('a lock resolving a @venizia entry from the registry fails', () => {
    const lock = lockWith({
      kernel: `"@venizia/ignis-kernel@${TARBALL}"`,
      helpers: `"@venizia/ignis-helpers@0.2.0-39", ""`,
    });
    const tarballs = new Map([
      ['@venizia/ignis-kernel', TARBALL],
      ['@venizia/ignis-helpers', HELPERS_TARBALL],
    ]);

    const problems = findUnpinnedWorkspaceEntries({
      lock,
      tarballs,
      package: '@venizia/ignis-kernel',
    });
    expect(problems).toEqual([
      "@venizia/ignis-helpers resolves to '0.2.0-39', not the packed tarball",
    ]);
  });

  test('a lock missing the sandboxed package fails', () => {
    const lock = lockWith({
      kernel: `"@venizia/ignis-kernel@${TARBALL}"`,
      helpers: `"@venizia/ignis-helpers@${HELPERS_TARBALL}"`,
    });
    const tarballs = new Map([
      ['@venizia/ignis-kernel', TARBALL],
      ['@venizia/ignis-helpers', HELPERS_TARBALL],
    ]);

    expect(
      findUnpinnedWorkspaceEntries({ lock, tarballs, package: '@venizia/ignis-filter' }),
    ).toEqual(['@venizia/ignis-filter is missing from bun.lock']);
  });

  test('a browser-claimed ESM entry no row loads is reported', () => {
    const browserEntries = [
      'packages/kernel/dist/esm/index.js',
      'packages/kernel/dist/esm/metadata.js',
    ];

    expect(
      findUnmatchedBrowserEntries({
        browserEntries,
        rowEntries: ['packages/kernel/dist/esm/index.js', 'packages/kernel/dist/esm/metadata.js'],
      }),
    ).toEqual([]);
    expect(
      findUnmatchedBrowserEntries({
        browserEntries,
        rowEntries: ['packages/kernel/dist/esm/index.js'],
      }),
    ).toEqual(['packages/kernel/dist/esm/metadata.js']);
  });

  test('a build older than its source, or missing, is stale', () => {
    expect(isBuildStale({ newestSourceMs: 1_000, newestDistMs: 2_000 })).toBe(false);
    expect(isBuildStale({ newestSourceMs: 2_000, newestDistMs: 2_000 })).toBe(false);
    expect(isBuildStale({ newestSourceMs: 3_000, newestDistMs: 2_000 })).toBe(true);
    expect(isBuildStale({ newestSourceMs: 3_000 })).toBe(true);
  });

  test('the import-order check fails on the first failing run and names it', async () => {
    const sandbox = mkdtempSync(join(tmpdir(), 'ign-order-'));
    scratch.push(sandbox);
    writeOrderFixture({ sandbox, failOnRun: 3 });

    const result = await checkImportOrder({ row: ORDER_ROW, sandbox, runs: 5 });

    expect(result).toEqual({
      name: 'bun-order',
      ok: false,
      detail: 'run 3/5: error: load failed on run 3',
    });
    expect(readFileSync(join(sandbox, 'runs.txt'), 'utf8')).toBe('3');
  });

  test('the import-order check passes only after every run loaded', async () => {
    const sandbox = mkdtempSync(join(tmpdir(), 'ign-order-'));
    scratch.push(sandbox);
    writeOrderFixture({ sandbox });

    const result = await checkImportOrder({ row: ORDER_ROW, sandbox, runs: 5 });

    expect(result).toEqual({ name: 'bun-order', ok: true, detail: '' });
    expect(readFileSync(join(sandbox, 'runs.txt'), 'utf8')).toBe('5');
  });
});
