import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertNoWorkspaceExternal } from '@venizia/dev-configs/checks';
import { PURITY_MANIFEST } from '../manifest';

const REPOSITORY_ROOT = join(__dirname, '../../../..');

const readPublishedTargets = (opts: { package: string }): string[] => {
  const manifestPath = join(REPOSITORY_ROOT, 'packages', opts.package, 'package.json');
  const exportsMap = (
    JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      exports: Record<string, string | Record<string, string>>;
    }
  ).exports;

  const targets: string[] = [];

  const exportsMapEntries = Object.entries(exportsMap);
  for (const [subpath, target] of exportsMapEntries) {
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
});

describe('PURITY_MANIFEST derivation', () => {
  const claimedPackages = [...new Set(PURITY_MANIFEST.map((row) => row.package))];

  // `helpers` is the deliberate exception and is asserted separately below.
  const fullSurfacePackages = claimedPackages.filter((name) => name !== 'helpers');

  test.each(fullSurfacePackages)(
    'every entry point %s publishes has a row',
    (packageName: string) => {
      const probed = new Set(
        PURITY_MANIFEST.filter((row) => row.package === packageName).map((row) => row.entry),
      );

      const publishedTargets = readPublishedTargets({ package: packageName });
      for (const target of publishedTargets) {
        expect(probed).toContain(target);
      }
    },
  );

  test('connectors is covered sub-path by sub-path, not just in total', () => {
    const probed = new Set(
      PURITY_MANIFEST.filter((row) => row.package === 'connectors').map((row) => row.entry),
    );

    // Named explicitly, because these two are what the hand-written manifest missed: the browser
    // example imports both, and both reach `node:async_hooks` through `hono/context-storage`.
    expect(probed).toContain('packages/connectors/dist/esm/relational/postgres/index.js');
    expect(probed).toContain('packages/connectors/dist/esm/relational/sqlite/index.js');
  });

  test('helpers claims its five sub-paths and NOT its root barrel', () => {
    const entries = PURITY_MANIFEST.filter((row) => row.package === 'helpers').map(
      (row) => row.entry,
    );

    expect(entries.toSorted()).toEqual([
      'packages/helpers/dist/esm/common/index.js',
      'packages/helpers/dist/esm/core.js',
      'packages/helpers/dist/esm/modules/socket/socket-io/browser.js',
      'packages/helpers/dist/esm/temporal.js',
      'packages/helpers/dist/esm/uuid.js',
    ]);
  });

  test('a package yields one row per runtime condition', () => {
    const labels = PURITY_MANIFEST.filter((row) => row.package === 'inversion').map(
      (row) => row.label,
    );

    // `exports['.']` names `types` (not a runtime target) and `default`: one row, so no condition in its label.
    expect(labels).toEqual(['inversion']);
  });
});
