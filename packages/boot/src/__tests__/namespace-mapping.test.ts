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
  'packages/dev-configs/src/cli/codemod/namespace-functions/mappings/boot.ts',
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
const { BOOT_MAPPINGS } = mappingModule as { BOOT_MAPPINGS: ReadonlyArray<IMapping> };

/** The src module behind each specifier of this package. */
const ENTRIES: Record<string, () => Promise<Record<string, unknown>>> = {
  '@venizia/ignis-boot': () => import('../index'),
  '@venizia/ignis-boot/generator': () => import('../generator'),
};

describe('the boot entries of the namespace-functions table', () => {
  test('the table is not empty', () => {
    expect(BOOT_MAPPINGS.length).toBeGreaterThan(0);
  });

  for (const entry of BOOT_MAPPINGS) {
    describe(`${entry.oldName} -> ${entry.className}.${entry.method}`, () => {
      for (const specifier of entry.modules) {
        test(`from ${specifier}: the old name is gone`, async () => {
          expect(specifier in ENTRIES).toBe(true);
          const loaded = await ENTRIES[specifier]!();

          expect(loaded[entry.oldName]).toBeUndefined();
        });

        test(`from ${specifier}: the class has the static method`, async () => {
          const loaded = await ENTRIES[specifier]!();
          const klass = loaded[entry.className] as Record<string, unknown> | undefined;

          expect(typeof klass).toBe('function');
          expect(typeof klass?.[entry.method]).toBe('function');
        });
      }
    });
  }
});
