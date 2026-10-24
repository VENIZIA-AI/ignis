import { describe, expect, test } from 'bun:test';
import {
  assertEveryPackageClaimed,
  deriveInstallRows,
  getRequiredPeers,
  INSTALL_CLAIMS,
  listPublishedPackages,
  readPackageManifest,
} from '../clean-install/manifest';

describe('clean-install manifest', () => {
  test('derives a row for every code sub-path each package publishes', () => {
    const rows = deriveInstallRows({ claims: INSTALL_CLAIMS });

    for (const claim of INSTALL_CLAIMS) {
      const exportsMap = readPackageManifest({ package: claim.package }).exports ?? {};
      const published = claim.configOnly
        ? []
        : Object.keys(exportsMap).filter(
            subpath => subpath !== './package.json' && !subpath.endsWith('.json'),
          );
      const derived = rows.filter(row => row.package === claim.package).map(row => row.subpath);

      expect(derived.sort()).toEqual(published.sort());
    }
  });

  test('a sub-path granted no peer is derived with none', () => {
    const rows = deriveInstallRows({ claims: INSTALL_CLAIMS });
    const repository = rows.find(row => row.specifier === '@venizia/ignis-kernel/repository');

    expect(repository?.extras).toEqual([]);
  });

  test('a claim naming a sub-path the package does not publish is refused', () => {
    expect(() =>
      deriveInstallRows({ claims: [{ package: 'kernel', requires: { './nope': ['hono'] } }] }),
    ).toThrow(/does not publish/);
  });

  test('the postgres-js alias is loaded under Bun with postgres imported after it', () => {
    const rows = deriveInstallRows({ claims: INSTALL_CLAIMS });
    const postgresJs = rows.find(row => row.specifier === '@venizia/ignis/postgres/postgres-js');

    expect(postgresJs?.importedAfter).toEqual(['postgres']);
    expect(postgresJs?.extras).toContain('postgres');
  });

  test('the root entry is loaded under Bun with jose imported after it', () => {
    const rows = deriveInstallRows({ claims: INSTALL_CLAIMS });
    const root = rows.find(row => row.specifier === '@venizia/ignis');

    expect(root?.importedAfter).toEqual(['jose']);
    expect(root?.extras).toEqual([]);
  });

  test('the required peers are the peers not marked optional, with their ranges', () => {
    const manifest = {
      name: 'probe',
      peerDependencies: { unmarked: '^1.0.0', optional: '^2.0.0', explicit: '^3.0.0' },
      peerDependenciesMeta: { optional: { optional: true }, explicit: { optional: false } },
    };

    expect(getRequiredPeers({ manifest })).toEqual({ unmarked: '^1.0.0', explicit: '^3.0.0' });
  });

  test('a required peer is imported after a sub-path without a grant', () => {
    expect(() =>
      deriveInstallRows({ claims: [{ package: 'core-server', importedAfter: { '.': ['jose'] } }] }),
    ).not.toThrow();
  });

  test('a peer imported after a sub-path that the claim does not grant it is refused', () => {
    expect(() =>
      deriveInstallRows({
        claims: [
          { package: 'core-server', importedAfter: { './postgres/postgres-js': ['postgres'] } },
        ],
      }),
    ).toThrow(/does not grant that sub-path/);
  });

  test('a claim granting a peer the package does not declare is refused', () => {
    expect(() =>
      deriveInstallRows({ claims: [{ package: 'kernel', requires: { '.': ['left-pad'] } }] }),
    ).toThrow(/does not declare as a peer/);
  });

  test('every published package in the workspace carries a claim', () => {
    const claimed = assertEveryPackageClaimed({
      packages: listPublishedPackages(),
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

    expect(() => assertEveryPackageClaimed({ packages, claims: [{ package: 'kernel' }] })).toThrow(
      /no claim in INSTALL_CLAIMS: newcomer/,
    );
    expect(
      assertEveryPackageClaimed({
        packages,
        claims: [{ package: 'kernel' }, { package: 'newcomer', configOnly: true }],
      }),
    ).toEqual(['kernel', 'newcomer']);
  });

  test('a config-only claim derives no row', () => {
    expect(deriveInstallRows({ claims: [{ package: 'dev-configs', configOnly: true }] })).toEqual(
      [],
    );
  });
});
