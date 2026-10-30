import { describe, expect, test } from 'bun:test';
import { INSTALL_CLAIMS, InstallManifest } from '../clean-install/manifest';

describe('clean-install manifest', () => {
  test('derives a row for every code sub-path each package publishes', () => {
    const rows = InstallManifest.deriveRows({ claims: INSTALL_CLAIMS });

    for (const claim of INSTALL_CLAIMS) {
      const exportsMap = InstallManifest.readPackage({ package: claim.package }).exports ?? {};
      const published = claim.configOnly
        ? []
        : Object.keys(exportsMap).filter(
            (subpath) => subpath !== './package.json' && !subpath.endsWith('.json'),
          );
      const derived = rows.filter((row) => row.package === claim.package).map((row) => row.subpath);

      expect(derived.sort()).toEqual(published.sort());
    }
  });

  test('a sub-path granted no peer is derived with none', () => {
    const rows = InstallManifest.deriveRows({ claims: INSTALL_CLAIMS });
    const repository = rows.find((row) => row.specifier === '@venizia/ignis-kernel/repository');

    expect(repository?.extras).toEqual([]);
  });

  test('a claim naming a sub-path the package does not publish is refused', () => {
    expect(() =>
      InstallManifest.deriveRows({
        claims: [{ package: 'kernel', requires: { './nope': ['hono'] } }],
      }),
    ).toThrow(/does not publish/);
  });

  test('the required peers are the peers not marked optional, with their ranges', () => {
    const manifest = {
      name: 'probe',
      peerDependencies: { unmarked: '^1.0.0', optional: '^2.0.0', explicit: '^3.0.0' },
      peerDependenciesMeta: { optional: { optional: true }, explicit: { optional: false } },
    };

    expect(InstallManifest.getRequiredPeers({ manifest })).toEqual({
      unmarked: '^1.0.0',
      explicit: '^3.0.0',
    });
  });

  test('a claim granting a peer the package does not declare is refused', () => {
    expect(() =>
      InstallManifest.deriveRows({
        claims: [{ package: 'kernel', requires: { '.': ['left-pad'] } }],
      }),
    ).toThrow(/does not declare as a peer/);
  });

  test('every published package in the workspace carries a claim', () => {
    const claimed = InstallManifest.assertEveryPackageClaimed({
      packages: InstallManifest.listPublished(),
      claims: INSTALL_CLAIMS,
    });

    expect(claimed).toContain('dev-configs');
  });

  test('a published package with no claim is refused, a private one is not', () => {
    const packages = [
      { directory: 'kernel', private: false },
      { directory: 'playground', private: true },
      { directory: 'newcomer', private: false },
    ];

    expect(() =>
      InstallManifest.assertEveryPackageClaimed({ packages, claims: [{ package: 'kernel' }] }),
    ).toThrow(/no claim in INSTALL_CLAIMS: newcomer/);
    expect(
      InstallManifest.assertEveryPackageClaimed({
        packages,
        claims: [{ package: 'kernel' }, { package: 'newcomer', configOnly: true }],
      }),
    ).toEqual(['kernel', 'newcomer']);
  });

  test('a config-only claim derives no row', () => {
    expect(
      InstallManifest.deriveRows({ claims: [{ package: 'dev-configs', configOnly: true }] }),
    ).toEqual([]);
  });
});
