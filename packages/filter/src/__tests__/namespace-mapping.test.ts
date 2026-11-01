import { join, resolve } from 'node:path';
import { describe, expect, test } from 'bun:test';

/**
 * The codemod table of this package (`devz codemod namespace-functions`) is the only upgrade path
 * for the old function names: every entry names a class method that exists, and the old name is no
 * longer exported from any module the entry lists. The table is read from its source by path, not
 * through a package import.
 */
const ROOT = resolve(import.meta.dir, '../../../..');
const MAPPING_FILE = join(
  ROOT,
  'packages/dev-configs/src/cli/codemod/namespace-functions/mappings/filter.ts',
);

interface IMapping {
  modules: string[];
  oldName: string;
  className: string;
  method: string;
  params: Array<{ key: string; optional?: boolean }>;
  restKey?: string;
  keepsOptions?: boolean;
}

const mappingModule = await import(MAPPING_FILE);
const { FILTER_MAPPINGS } = mappingModule as { FILTER_MAPPINGS: ReadonlyArray<IMapping> };

/** The src module behind each specifier of this package. The kernel and the core server re-export `.` with `export *`. */
const ENTRIES: Record<string, () => Promise<Record<string, unknown>>> = {
  '@venizia/ignis-filter': () => import('../index'),
  '@venizia/ignis-filter/schemas': () => import('../schemas'),
};
const RE_EXPORTERS = ['@venizia/ignis-kernel', '@venizia/ignis'];

describe('the filter entries of the namespace-functions table', () => {
  test('the table is not empty', () => {
    expect(FILTER_MAPPINGS.length).toBeGreaterThan(0);
  });

  test('every specifier is this package or a package that re-exports it whole', () => {
    for (const entry of FILTER_MAPPINGS) {
      const unknown = entry.modules.filter(
        (specifier) => !(specifier in ENTRIES) && !RE_EXPORTERS.includes(specifier),
      );

      expect(unknown).toEqual([]);
    }
  });

  for (const entry of FILTER_MAPPINGS) {
    describe(`${entry.oldName} -> ${entry.className}.${entry.method}`, () => {
      for (const specifier of entry.modules.filter((module) => module in ENTRIES)) {
        test(`from ${specifier}: the old name is gone`, async () => {
          const loaded = await ENTRIES[specifier]!();

          expect(loaded[entry.oldName]).toBeUndefined();
        });
      }

      test('the class has the static method', async () => {
        const own = entry.modules.find((module) => module in ENTRIES);
        const loaded = await ENTRIES[own!]!();
        const klass = loaded[entry.className] as Record<string, unknown> | undefined;

        expect(typeof klass).toBe('function');
        expect(typeof klass?.[entry.method]).toBe('function');
      });
    });
  }
});
