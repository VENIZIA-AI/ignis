import { describe, expect, test } from 'bun:test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { type IPlanPackage, ReleasePlan } from '../release-plan';

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

/** The real preset templates `scripts/preset/vulcan-preset.ts` builds the shipped presets from. */
const PRESET_TEMPLATES: unknown[] = readdirSync(join(REPO, 'presets'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => join(REPO, 'presets', entry.name, 'preset.json'))
  .filter((path) => existsSync(path))
  .map((path) => JSON.parse(readFileSync(path, 'utf8')));

/** The real workspace manifests, in release order, with the given packages marked as changed. */
const workspace = (changed: string[]): IPlanPackage[] => {
  return ORDER.map((name) => {
    const manifest = JSON.parse(readFileSync(join(REPO, 'packages', name, 'package.json'), 'utf8'));

    return {
      name,
      packageName: manifest.name,
      dependsOn: ReleasePlan.dependsOn({ manifest, presets: PRESET_TEMPLATES }),
      changedFiles: changed.includes(name) ? 3 : 0,
    };
  });
};

const names = (changed: string[]) =>
  ReleasePlan.planFullSweep({ packages: workspace(changed) }).map((entry) => entry.name);

describe('ReleasePlan.planFullSweep - a synthetic chain', () => {
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
    expect(ReleasePlan.planFullSweep({ packages: withChanged([]) })).toEqual([]);
  });

  test('a changed package releases itself and every transitive dependent, in order', () => {
    expect(ReleasePlan.planFullSweep({ packages: withChanged(['a']) })).toEqual([
      { name: 'a' },
      { name: 'b', cascadedFrom: ['@x/a'] },
      { name: 'c', cascadedFrom: ['@x/b'] },
    ]);
  });

  test('a package the change does not reach is left out', () => {
    expect(
      ReleasePlan.planFullSweep({ packages: withChanged(['a']) }).map((entry) => entry.name),
    ).not.toContain('d');
  });

  test('a package with its own change is not reported as cascaded', () => {
    const planned = ReleasePlan.planFullSweep({ packages: withChanged(['a', 'b']) });

    expect(planned.find((entry) => entry.name === 'b')).toEqual({ name: 'b' });
  });

  test('a never-released package (Infinity) counts as changed', () => {
    const packages = chain.map((pkg) => ({
      ...pkg,
      changedFiles: pkg.name === 'b' ? Number.POSITIVE_INFINITY : 0,
    }));

    expect(ReleasePlan.planFullSweep({ packages }).map((entry) => entry.name)).toEqual(['b', 'c']);
  });

  test('names the packages it cascades from', () => {
    const packages: IPlanPackage[] = [
      { name: 'a', packageName: '@x/a', dependsOn: [], changedFiles: 1 },
      { name: 'b', packageName: '@x/b', dependsOn: [], changedFiles: 1 },
      {
        name: 'c',
        packageName: '@x/c',
        dependsOn: ['@x/a', '@x/b', '@y/outside'],
        changedFiles: 0,
      },
    ];

    expect(ReleasePlan.planFullSweep({ packages }).at(-1)).toEqual({
      name: 'c',
      cascadedFrom: ['@x/a', '@x/b'],
    });
  });
});

describe('ReleasePlan.planFullSweep - the real workspace', () => {
  test('helpers changed: boot, kernel, connectors, the worker and the server follow; inversion, filter and dev-configs do not', () => {
    expect(names(['helpers'])).toEqual([
      'helpers',
      'boot',
      'kernel',
      'connectors',
      'core-worker',
      'core-server',
    ]);
  });

  test('kernel changed: the worker follows (the 0.4.2 case), and boot does not', () => {
    const planned = names(['kernel']);

    expect(planned).toContain('core-worker');
    expect(planned).not.toContain('boot');
  });

  test('inversion changed: every package that ships it follows, dev-configs does not', () => {
    const planned = names(['inversion']);

    expect(planned).toEqual([
      'inversion',
      'filter',
      'helpers',
      'boot',
      'kernel',
      'connectors',
      'core-worker',
      'core-server',
    ]);
  });

  test('dev-configs changed releases itself and core-server: its preset lists dev-configs as a devDependency', () => {
    expect(names(['dev-configs'])).toEqual(['dev-configs', 'core-server']);
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

describe('ReleasePlan - a package that ships presets is released with the tools its preset templates name', () => {
  // `@venizia/ignis` (core-server) builds `dist/presets` from `presets/*/preset.json`, where `workspace:*` becomes the
  // workspace version at build time. 0.4.7-3 went out with a boot that threw under Node and the 0.4.7-4 plan released
  // only dev-configs and boot, so a fresh project still got the broken boot.
  test('boot changed: core-server is released too, for boot', () => {
    const planned = ReleasePlan.planFullSweep({ packages: workspace(['boot']) });
    const coreServer = planned.find((entry) => entry.name === 'core-server');

    expect(coreServer?.cascadedFrom).toContain('@venizia/ignis-boot');
  });

  test('dev-configs changed: core-server is released too, for dev-configs', () => {
    const planned = ReleasePlan.planFullSweep({ packages: workspace(['dev-configs']) });
    const coreServer = planned.find((entry) => entry.name === 'core-server');

    expect(coreServer?.cascadedFrom).toContain('@venizia/dev-configs');
  });

  test('every workspace package a real preset template names is a dependency of core-server, except core-server itself', () => {
    const manifest = JSON.parse(
      readFileSync(join(REPO, 'packages', 'core-server', 'package.json'), 'utf8'),
    );
    const named = PRESET_TEMPLATES.flatMap((template) =>
      ReleasePlan.workspaceNames({ value: template }),
    );
    const dependsOn = ReleasePlan.dependsOn({ manifest, presets: PRESET_TEMPLATES });

    expect(Object.keys(manifest.vulcan.presets).length).toBeGreaterThan(0);
    expect(named).toContain('@venizia/ignis-boot');
    expect(named).toContain('@venizia/dev-configs');
    for (const name of named.filter((candidate) => candidate !== manifest.name)) {
      expect(dependsOn).toContain(name);
    }
  });

  test('a tool added to a preset template and nowhere else still makes the preset package follow it', () => {
    const dependsOn = ReleasePlan.dependsOn({
      manifest: { vulcan: { presets: { app: './preset.json' } } },
      presets: [{ devDependencies: { '@x/new-tool': 'workspace:*', typescript: 'catalog:' } }],
    });

    expect(dependsOn).toEqual(['@x/new-tool']);
  });

  test('a package that ships no presets ignores the templates and its devDependencies', () => {
    const dependsOn = ReleasePlan.dependsOn({
      manifest: { dependencies: { '@x/a': '1.0.0' }, peerDependencies: { '@x/b': '^1.0.0' } },
      presets: [{ devDependencies: { '@x/tool': 'workspace:*' } }],
    });

    expect(dependsOn).toEqual(['@x/a', '@x/b']);
  });

  test('an empty or missing presets block means no presets', () => {
    const template = [{ devDependencies: { '@x/tool': 'workspace:*' } }];

    expect(
      ReleasePlan.dependsOn({ manifest: { vulcan: { presets: {} } }, presets: template }),
    ).toEqual([]);
    expect(ReleasePlan.dependsOn({ manifest: { vulcan: {} }, presets: template })).toEqual([]);
    expect(ReleasePlan.dependsOn({ manifest: {}, presets: template })).toEqual([]);
  });

  test('a name in the dependencies and in a template is listed once; nested blocks and non-workspace ranges are read right', () => {
    const dependsOn = ReleasePlan.dependsOn({
      manifest: { dependencies: { '@x/a': '1.0.0' }, vulcan: { presets: { app: './p.json' } } },
      presets: [
        {
          dependencies: { '@x/a': 'workspace:*' },
          peerDependencies: { '@x/b': 'workspace:^' },
          scripts: { test: 'bun test' },
        },
        { nested: { devDependencies: { '@x/c': 'workspace:*', '@x/d': '^1.0.0' } } },
        null,
        'text',
      ],
    });

    expect(dependsOn.sort()).toEqual(['@x/a', '@x/b', '@x/c']);
  });

  test('a synthetic preset package is cascaded from a tool its template names, a plain one is not', () => {
    const template = [{ devDependencies: { '@x/tool': 'workspace:*' } }];
    const packages: IPlanPackage[] = [
      { name: 'tool', packageName: '@x/tool', dependsOn: [], changedFiles: 4 },
      {
        name: 'app',
        packageName: '@x/app',
        dependsOn: ReleasePlan.dependsOn({
          manifest: { vulcan: { presets: { app: './preset.json' } } },
          presets: template,
        }),
        changedFiles: 0,
      },
      {
        name: 'plain',
        packageName: '@x/plain',
        dependsOn: ReleasePlan.dependsOn({ manifest: {}, presets: template }),
        changedFiles: 0,
      },
    ];

    expect(ReleasePlan.planFullSweep({ packages })).toEqual([
      { name: 'tool' },
      { name: 'app', cascadedFrom: ['@x/tool'] },
    ]);
  });
});
