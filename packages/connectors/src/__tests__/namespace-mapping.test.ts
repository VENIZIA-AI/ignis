import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The public functions of this package that moved into a class, and the codemod table that is the
 * only upgrade path for their old names (`devz codemod namespace-functions`): every entry names a
 * class method that exists, and the old name is no longer exported from any connectors module the
 * entry lists. A core-server module of an entry is an `export *` mirror of the connectors module of
 * the same name, so the connectors module stands for it.
 */

interface IMapping {
  modules: string[];
  oldName: string;
  className: string;
  method: string;
  newModules?: string[];
  params: Array<{ key: string; optional?: boolean }>;
  restKey?: string;
  keepsOptions?: boolean;
}

const REPOSITORY_ROOT = join(import.meta.dir, '../../../..');

const mappingModule: { CONNECTORS_MAPPINGS: ReadonlyArray<IMapping> } = await import(
  join(
    REPOSITORY_ROOT,
    'packages/dev-configs/src/cli/codemod/namespace-functions/mappings/connectors.ts',
  )
);
const { CONNECTORS_MAPPINGS } = mappingModule;

const PACKAGE_SPECIFIER = '@venizia/ignis-connectors';
const CORE_SERVER_SPECIFIER = '@venizia/ignis';

/** Each package entry of the exports map, as the source module the entry is built from. */
const SOURCE_ENTRIES: Record<string, () => Promise<Record<string, unknown>>> = {
  [PACKAGE_SPECIFIER]: () => import('@/index'),
  [`${PACKAGE_SPECIFIER}/relational`]: () => import('@/relational/core'),
  [`${PACKAGE_SPECIFIER}/postgres`]: () => import('@/relational/postgres'),
  [`${PACKAGE_SPECIFIER}/postgres/supabase`]: () => import('@/relational/postgres/supabase'),
  [`${PACKAGE_SPECIFIER}/sqlite`]: () => import('@/relational/sqlite'),
  [`${PACKAGE_SPECIFIER}/search`]: () => import('@/search/core'),
  [`${PACKAGE_SPECIFIER}/search/controllers`]: () => import('@/search/core/controllers'),
  [`${PACKAGE_SPECIFIER}/typesense`]: () => import('@/search/typesense'),
  [`${PACKAGE_SPECIFIER}/typesense/controllers`]: () => import('@/search/typesense/controllers'),
  [`${PACKAGE_SPECIFIER}/meilisearch`]: () => import('@/search/meilisearch'),
};

const loadModule = async (specifier: string): Promise<Record<string, unknown>> => {
  const load = SOURCE_ENTRIES[specifier];
  if (!load) {
    throw new Error(`no source entry known for ${specifier}`);
  }

  return load();
};

const isConnectorsModule = (specifier: string) =>
  specifier === PACKAGE_SPECIFIER || specifier.startsWith(`${PACKAGE_SPECIFIER}/`);

const readExportsMap = (packageFolder: string): string[] => {
  const parsed: { exports: Record<string, unknown> } = JSON.parse(
    readFileSync(join(REPOSITORY_ROOT, 'packages', packageFolder, 'package.json'), 'utf8'),
  );
  return Object.keys(parsed.exports);
};

const toSubpath = (opts: { specifier: string; base: string }) => {
  const { specifier, base } = opts;
  return specifier === base ? '.' : `.${specifier.slice(base.length)}`;
};

describe('the mapping table of this package', () => {
  test('has entries, valid keys and no module this package does not export', () => {
    expect(CONNECTORS_MAPPINGS.length).toBeGreaterThan(0);

    const packageSubpaths = readExportsMap('connectors');
    const coreServerSubpaths = readExportsMap('core-server');

    for (const mapping of CONNECTORS_MAPPINGS) {
      expect(mapping.modules.length).toBeGreaterThan(0);

      for (const specifier of mapping.modules) {
        const isConnectors = isConnectorsModule(specifier);
        const subpaths = isConnectors ? packageSubpaths : coreServerSubpaths;
        const base = isConnectors ? PACKAGE_SPECIFIER : CORE_SERVER_SPECIFIER;

        expect(subpaths).toContain(toSubpath({ specifier, base }));
      }
    }
  });

  test('no old name appears twice for the same module', () => {
    const seen = new Set<string>();
    const repeated: string[] = [];

    for (const mapping of CONNECTORS_MAPPINGS) {
      for (const specifier of mapping.modules) {
        const key = `${specifier}#${mapping.oldName}`;
        if (seen.has(key)) {
          repeated.push(key);
        }
        seen.add(key);
      }
    }

    expect(repeated).toEqual([]);
  });

  test('a core-server module of an entry mirrors a connectors module of the same entry', () => {
    for (const mapping of CONNECTORS_MAPPINGS) {
      for (const specifier of mapping.modules.filter((item) => !isConnectorsModule(item))) {
        // The root of `@venizia/ignis` re-exports `@venizia/ignis-connectors/postgres`.
        const mirrored =
          specifier === CORE_SERVER_SPECIFIER
            ? `${PACKAGE_SPECIFIER}/postgres`
            : `${PACKAGE_SPECIFIER}${specifier.slice(CORE_SERVER_SPECIFIER.length)}`;

        expect(mapping.modules).toContain(mirrored);
      }
    }
  });
});

describe('the old name and the class, per mapping entry', () => {
  for (const mapping of CONNECTORS_MAPPINGS) {
    describe(`${mapping.oldName} -> ${mapping.className}.${mapping.method}`, () => {
      for (const specifier of mapping.modules.filter(isConnectorsModule)) {
        test(`from ${specifier}: the old name is gone`, async () => {
          const loaded = await loadModule(specifier);

          expect(loaded[mapping.oldName]).toBeUndefined();
        });
      }

      test('the class has the static method', async () => {
        const specifier = (mapping.newModules ?? mapping.modules).find(isConnectorsModule);
        if (!specifier) {
          throw new Error(`${mapping.className}.${mapping.method} lists no connectors module`);
        }

        const loaded = await loadModule(specifier);
        const klass = loaded[mapping.className] as Record<string, unknown> | undefined;

        expect(typeof klass).toBe('function');
        expect(typeof klass?.[mapping.method]).toBe('function');
      });
    });
  }
});
