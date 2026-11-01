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
  'packages/dev-configs/src/cli/codemod/namespace-functions/mappings/inversion.ts',
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
const { INVERSION_MAPPINGS } = mappingModule as { INVERSION_MAPPINGS: ReadonlyArray<IMapping> };

/**
 * The source file behind each specifier the table names. The helpers and the kernel re-export this
 * package's names one by one, so they are the places an old name could outlive its removal;
 * `@venizia/ignis` re-exports the kernel with `export *`. The helpers load from source on top of this
 * package's build; the kernel needs the helpers' build, which this package's test must not wait for,
 * so its re-export list is read as text.
 */
const SOURCES: Record<string, string> = {
  '@venizia/ignis-inversion': 'packages/inversion/src/index.ts',
  '@venizia/ignis-helpers': 'packages/helpers/src/index.ts',
  '@venizia/ignis-helpers/common': 'packages/helpers/src/common/index.ts',
};
const KERNEL_REEXPORT = 'packages/kernel/src/helpers/inversion/index.ts';
const KERNEL_SPECIFIERS = ['@venizia/ignis-kernel', '@venizia/ignis'];

const loadModule = async (specifier: string): Promise<Record<string, unknown>> => {
  const source = SOURCES[specifier];
  if (!source) {
    throw new Error(`no source file is mapped to ${specifier}`);
  }

  return import(join(ROOT, source));
};

const hasOldName = async (opts: { specifier: string; oldName: string }): Promise<boolean> => {
  const { specifier, oldName } = opts;

  if (KERNEL_SPECIFIERS.includes(specifier)) {
    const text = await Bun.file(join(ROOT, KERNEL_REEXPORT)).text();
    return new RegExp(`\\b${oldName}\\b`).test(text);
  }

  const loaded = await loadModule(specifier);
  return loaded[oldName] !== undefined;
};

describe('the inversion entries of the namespace-functions table', () => {
  test('the table is not empty', () => {
    expect(INVERSION_MAPPINGS.length).toBeGreaterThan(0);
  });

  test('no old name appears twice for the same module', () => {
    const seen = new Set<string>();
    const repeated: string[] = [];

    for (const entry of INVERSION_MAPPINGS) {
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

  for (const entry of INVERSION_MAPPINGS) {
    describe(`${entry.oldName} -> ${entry.className}.${entry.method}`, () => {
      for (const specifier of entry.modules) {
        test(`from ${specifier}: the old name is gone`, async () => {
          const result = await hasOldName({ specifier, oldName: entry.oldName });
          expect(result).toBe(false);
        });
      }

      test('the class has the static method', async () => {
        const loaded = await loadModule('@venizia/ignis-inversion');
        const klass = loaded[entry.className] as Record<string, unknown> | undefined;

        expect(typeof klass).toBe('function');
        expect(typeof klass?.[entry.method]).toBe('function');
      });
    });
  }
});
