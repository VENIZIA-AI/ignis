import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertNoWorkspaceExternal, deriveEntries, PURITY_MANIFEST } from '../manifest';
import type { IPurityEntry } from '../manifest';

const REPOSITORY_ROOT = join(__dirname, '../../..');

const readPublishedTargets = (opts: { package: string }): string[] => {
  const manifestPath = join(REPOSITORY_ROOT, 'packages', opts.package, 'package.json');
  const exportsMap = (
    JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      exports: Record<string, string | Record<string, string>>;
    }
  ).exports;

  const targets: string[] = [];

  for (const [subpath, target] of Object.entries(exportsMap)) {
    if (subpath === './package.json') {
      continue;
    }

    const files =
      typeof target === 'string'
        ? [target]
        : Object.entries(target)
            .filter(([condition]) => condition !== 'types')
            .map(([, file]) => file);

    for (const file of files) {
      targets.push(join('packages', opts.package, file));
    }
  }

  return [...new Set(targets)];
};

describe('assertNoWorkspaceExternal', () => {
  test('the real manifest passes - nothing externalises a workspace package', () => {
    expect(() => assertNoWorkspaceExternal(PURITY_MANIFEST)).not.toThrow();
  });

  // The motivating case: this is exactly the escape hatch that would silently hide a real
  // root-barrel leak (like the one this task fixed) by removing it from the module graph.
  test('rejects an entry that externalises an IGNIS workspace package', () => {
    const poisoned: IPurityEntry[] = [
      {
        label: 'poisoned',
        package: 'connectors',
        entry: 'irrelevant.js',
        external: ['@venizia/ignis-helpers'],
      },
    ];

    expect(() => assertNoWorkspaceExternal(poisoned)).toThrow(/workspace package/);
    expect(() => assertNoWorkspaceExternal(poisoned)).toThrow(/poisoned/);
    expect(() => assertNoWorkspaceExternal(poisoned)).toThrow(/@venizia\/ignis-helpers/);
  });

  test('does not reject a third-party external', () => {
    const clean: IPurityEntry[] = [
      {
        label: 'clean',
        package: 'connectors',
        entry: 'irrelevant.js',
        external: ['@electric-sql/pglite'],
      },
    ];

    expect(() => assertNoWorkspaceExternal(clean)).not.toThrow();
  });

  test('rejects a workspace package buried behind an earlier third-party entry', () => {
    const mixed: IPurityEntry[] = [
      {
        label: 'mixed',
        package: 'connectors',
        entry: 'irrelevant.js',
        external: ['@electric-sql/pglite', '@venizia/ignis-kernel'],
      },
    ];

    expect(() => assertNoWorkspaceExternal(mixed)).toThrow(/@venizia\/ignis-kernel/);
  });
});

/**
 * The defect these cover: the manifest used to be hand-written, so `make purity` reported 11/11
 * while eleven of the thirteen sub-paths `@venizia/ignis-connectors` publishes were never probed -
 * including the two the browser example imports, one of which kills a Worker at import. A count is
 * not the property that matters; COVERAGE of the published surface is.
 */
describe('PURITY_MANIFEST derivation', () => {
  const claimedPackages = [...new Set(PURITY_MANIFEST.map(row => row.package))];

  // `helpers` is the deliberate exception and is asserted separately below.
  const fullSurfacePackages = claimedPackages.filter(name => name !== 'helpers');

  test.each(fullSurfacePackages)(
    'every entry point %s publishes has a row',
    (packageName: string) => {
      const probed = new Set(
        PURITY_MANIFEST.filter(row => row.package === packageName).map(row => row.entry),
      );

      for (const target of readPublishedTargets({ package: packageName })) {
        expect(probed).toContain(target);
      }
    },
  );

  test('connectors is covered sub-path by sub-path, not just in total', () => {
    const probed = new Set(
      PURITY_MANIFEST.filter(row => row.package === 'connectors').map(row => row.entry),
    );

    // Named explicitly, because these two are what the hand-written manifest missed: the browser
    // example imports both, and both reach `node:async_hooks` through `hono/context-storage`.
    // BOTH builds, since the package is dual - and the two genuinely differ, which is the point:
    // `@libsql/client` reaches `child_process` only on its CommonJS path.
    expect(probed).toContain('packages/connectors/dist/cjs/relational/postgres/index.js');
    expect(probed).toContain('packages/connectors/dist/esm/relational/postgres/index.js');
    expect(probed).toContain('packages/connectors/dist/cjs/relational/sqlite/index.js');
    expect(probed).toContain('packages/connectors/dist/esm/relational/sqlite/index.js');
  });

  test('helpers claims two sub-paths and NOT its root barrel, in both builds', () => {
    const entries = PURITY_MANIFEST.filter(row => row.package === 'helpers').map(row => row.entry);

    expect(entries.toSorted()).toEqual([
      'packages/helpers/dist/cjs/common/index.js',
      'packages/helpers/dist/cjs/core.js',
      'packages/helpers/dist/esm/common/index.js',
      'packages/helpers/dist/esm/core.js',
    ]);
  });

  test('a claimed sub-path that the exports map no longer publishes fails the derivation', () => {
    expect(() =>
      deriveEntries({ package: 'helpers', subpaths: ['./core', './renamed-away'] }),
    ).toThrow(/no longer\s+publishes/);
  });

  test('an external declared for a sub-path that is gone fails the derivation', () => {
    expect(() =>
      deriveEntries({ package: 'connectors', external: { './renamed-away': ['pg'] } }),
    ).toThrow(/no longer\s+publishes/);
  });

  test('a dual-build package yields one row per distinct build, deduping the default condition', () => {
    const labels = PURITY_MANIFEST.filter(row => row.package === 'inversion').map(row => row.label);

    // `exports['.']` names import, require AND default; default repeats require's file.
    expect(labels).toEqual(['inversion [import]', 'inversion [require]']);
  });
});
