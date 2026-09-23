import { describe, expect, test } from 'bun:test';
import {
  assertEveryPackageClaimed,
  deriveInstallRows,
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
