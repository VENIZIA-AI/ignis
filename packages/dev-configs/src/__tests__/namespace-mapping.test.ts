import { describe, expect, test } from 'bun:test';
import { DEV_CONFIGS_MAPPINGS } from '../cli/codemod/namespace-functions/mappings/dev-configs';

/**
 * The functions of `@venizia/dev-configs` that moved into classes, and the codemod table that is the only
 * upgrade path for their old names (`mappings/dev-configs.ts`): every entry names a class method that exists,
 * and the old name is no longer exported from any entry the table lists.
 */

/** Each module specifier the table names, mapped to the source entry that `exports` points at. */
const ENTRIES: Record<string, () => Promise<Record<string, unknown>>> = {
  '@venizia/dev-configs': () => import('../index.js'),
  '@venizia/dev-configs/checks': () => import('../checks/index.js'),
  '@venizia/dev-configs/testing': () => import('../testing/index.js'),
  '@venizia/dev-configs/linters': () => import('../linters/index.js'),
};

const loadModule = async (specifier: string): Promise<Record<string, unknown>> => {
  const load = ENTRIES[specifier];
  if (!load) {
    throw new Error(`no source file is mapped to ${specifier}`);
  }

  return load();
};

describe('the dev-configs entries of the namespace-functions table', () => {
  test('the table is not empty', () => {
    expect(DEV_CONFIGS_MAPPINGS.length).toBeGreaterThan(0);
  });

  test('no old name appears twice for the same module', () => {
    const seen = new Set<string>();
    const repeated: string[] = [];

    for (const entry of DEV_CONFIGS_MAPPINGS) {
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

  for (const entry of DEV_CONFIGS_MAPPINGS) {
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
