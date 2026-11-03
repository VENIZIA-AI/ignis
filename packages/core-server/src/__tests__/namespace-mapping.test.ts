import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';

/**
 * The functions of `@venizia/ignis` that moved into classes, and the codemod table that is the only upgrade
 * path for their old names (`mappings/core-server.ts`): every entry names a class method that exists, and the
 * old name is no longer exported from any entry the table lists.
 */
const ROOT = join(__dirname, '../../../..');
const MAPPING_SOURCE = join(
  ROOT,
  'packages/dev-configs/src/cli/codemod/namespace-functions/mappings/core-server.ts',
);

interface IMappingEntry {
  modules: string[];
  oldName: string;
  className: string;
  method: string;
  newModules?: string[];
  params: Array<{ key: string; optional?: boolean }>;
  keepsOptions?: boolean;
}

const mappingModule: Record<string, unknown> = await import(MAPPING_SOURCE);
const CORE_SERVER_MAPPINGS = mappingModule.CORE_SERVER_MAPPINGS as ReadonlyArray<IMappingEntry>;

/** Each module specifier the table names, mapped to the source entry that `exports` points at. */
const ENTRIES: Record<string, () => Promise<Record<string, unknown>>> = {
  '@venizia/ignis': () => import('../index'),
  '@venizia/ignis/mail': () => import('../components/mail'),
  '@venizia/ignis/static-asset': () => import('../components/static-asset'),
  '@venizia/ignis/testing': () => import('../testing'),
};

const loadModule = async (specifier: string): Promise<Record<string, unknown>> => {
  const load = ENTRIES[specifier];
  if (!load) {
    throw new Error(`no source file is mapped to ${specifier}`);
  }

  return load();
};

describe('the core-server entries of the namespace-functions table', () => {
  test('the table is not empty', () => {
    expect(CORE_SERVER_MAPPINGS.length).toBeGreaterThan(0);
  });

  test('no old name appears twice for the same module', () => {
    const seen = new Set<string>();
    const repeated: string[] = [];

    for (const entry of CORE_SERVER_MAPPINGS) {
      for (const specifier of entry.modules) {
        const key = `${specifier}#${entry.oldName}`;
        if (seen.has(key)) {
          repeated.push(key);
        }
        seen.add(key);
      }
    }

    expect(repeated).toEqual([]);
  });

  for (const entry of CORE_SERVER_MAPPINGS) {
    describe(`${entry.oldName} -> ${entry.className}.${entry.method}`, () => {
      for (const specifier of entry.modules) {
        test(`from ${specifier}: the old name is gone`, async () => {
          const loaded = await loadModule(specifier);

          expect(loaded[entry.oldName]).toBeUndefined();
        });
      }

      test('the class has the static method', async () => {
        const classModule = await loadModule(entry.newModules?.[0] ?? entry.modules[0]);
        const klass = classModule[entry.className] as Record<string, unknown> | undefined;

        expect(typeof klass).toBe('function');
        expect(typeof klass?.[entry.method]).toBe('function');
      });
    });
  }
});
