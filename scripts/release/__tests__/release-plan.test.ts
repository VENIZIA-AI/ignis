import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { type IPlanPackage, planFullSweep } from '../release-plan';

const ORDER = [
  'dev-configs',
  'inversion',
  'filter',
  'helpers',
  'boot',
  'kernel',
  'connectors',
  'core-worker',
  'core-server',
] as const;

const REPO = resolve(import.meta.dir, '..', '..', '..');

/** The real workspace manifests, in release order, with the given packages marked as changed. */
const workspace = (changed: string[]): IPlanPackage[] => {
  return ORDER.map((name) => {
    const manifest = JSON.parse(readFileSync(join(REPO, 'packages', name, 'package.json'), 'utf8'));

    return {
      name,
      packageName: manifest.name,
      dependsOn: Object.keys({ ...manifest.dependencies, ...manifest.peerDependencies }),
      changedFiles: changed.includes(name) ? 3 : 0,
    };
  });
};

const names = (changed: string[]) => planFullSweep({ packages: workspace(changed) }).map((entry) => entry.name);

describe('planFullSweep - a synthetic chain', () => {
  const chain: IPlanPackage[] = [
    { name: 'a', packageName: '@x/a', dependsOn: [], changedFiles: 0 },
    { name: 'b', packageName: '@x/b', dependsOn: ['@x/a'], changedFiles: 0 },
    { name: 'c', packageName: '@x/c', dependsOn: ['@x/b'], changedFiles: 0 },
    { name: 'd', packageName: '@x/d', dependsOn: [], changedFiles: 0 },
  ];
  const withChanged = (changed: string[]) => {
    return chain.map((pkg) => ({ ...pkg, changedFiles: changed.includes(pkg.name) ? 1 : 0 }));
  };

  test('nothing changed, nothing released', () => {
    expect(planFullSweep({ packages: withChanged([]) })).toEqual([]);
  });

  test('a changed package releases itself and every transitive dependent, in order', () => {
    expect(planFullSweep({ packages: withChanged(['a']) })).toEqual([
      { name: 'a' },
      { name: 'b', cascadedFrom: ['@x/a'] },
      { name: 'c', cascadedFrom: ['@x/b'] },
    ]);
  });

  test('a package the change does not reach is left out', () => {
    expect(planFullSweep({ packages: withChanged(['a']) }).map((entry) => entry.name)).not.toContain('d');
  });

  test('a package with its own change is not reported as cascaded', () => {
    const planned = planFullSweep({ packages: withChanged(['a', 'b']) });

    expect(planned.find((entry) => entry.name === 'b')).toEqual({ name: 'b' });
  });

  test('a never-released package (Infinity) counts as changed', () => {
    const packages = chain.map((pkg) => ({
      ...pkg,
      changedFiles: pkg.name === 'b' ? Number.POSITIVE_INFINITY : 0,
    }));

    expect(planFullSweep({ packages }).map((entry) => entry.name)).toEqual(['b', 'c']);
  });

  test('names the packages it cascades from', () => {
    const packages: IPlanPackage[] = [
      { name: 'a', packageName: '@x/a', dependsOn: [], changedFiles: 1 },
      { name: 'b', packageName: '@x/b', dependsOn: [], changedFiles: 1 },
      { name: 'c', packageName: '@x/c', dependsOn: ['@x/a', '@x/b', '@y/outside'], changedFiles: 0 },
    ];

    expect(planFullSweep({ packages }).at(-1)).toEqual({ name: 'c', cascadedFrom: ['@x/a', '@x/b'] });
  });
});

describe('planFullSweep - the real workspace', () => {
  test('helpers changed: boot, kernel, connectors, the worker and the server follow; inversion, filter and dev-configs do not', () => {
    expect(names(['helpers'])).toEqual(['helpers', 'boot', 'kernel', 'connectors', 'core-worker', 'core-server']);
  });

  test('kernel changed: the worker follows (the 0.4.2 case), and boot does not', () => {
    const planned = names(['kernel']);

    expect(planned).toContain('core-worker');
    expect(planned).not.toContain('boot');
  });

  test('inversion changed: every package that ships it follows, dev-configs does not', () => {
    const planned = names(['inversion']);

    expect(planned).toEqual(['inversion', 'filter', 'helpers', 'boot', 'kernel', 'connectors', 'core-worker', 'core-server']);
  });

  test('dev-configs changed alone releases only itself: nothing ships it', () => {
    expect(names(['dev-configs'])).toEqual(['dev-configs']);
  });

  test('invariant: whatever changes, no package that stays behind depends on a released one', () => {
    const packages = workspace([]);
    const byName = new Map(packages.map((pkg) => [pkg.packageName, pkg.name]));

    for (const changed of ORDER) {
      const released = new Set(names([changed]));

      for (const pkg of packages.filter((candidate) => !released.has(candidate.name))) {
        for (const dependency of pkg.dependsOn) {
          const folder = byName.get(dependency);

          // A package left behind pins the old exact version of everything it ships.
          expect(folder !== undefined && released.has(folder)).toBe(false);
        }
      }
    }
  });
});
