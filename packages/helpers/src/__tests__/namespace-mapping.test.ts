import { describe, expect, test } from 'bun:test';
import path from 'node:path';
import { PACKAGE_ROOT } from './package-root';

/**
 * The functions of `@venizia/ignis-helpers` that moved into classes, and the codemod table that is the only
 * upgrade path for their old names: every entry names a class method that exists, and the old name is no longer
 * exported from any entry the table lists.
 */
const REPOSITORY_ROOT = path.resolve(PACKAGE_ROOT, '..', '..');
const MAPPING_SOURCE = path.resolve(
  REPOSITORY_ROOT,
  'packages/dev-configs/src/cli/codemod/namespace-functions/mappings/helpers.ts',
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

const mappingModule: { HELPERS_MAPPINGS: ReadonlyArray<IMappingEntry> } = await import(
  MAPPING_SOURCE
);
const { HELPERS_MAPPINGS } = mappingModule;

/** The module specifier of each entry the table names, mapped to the source file behind it. */
const SOURCES: Record<string, string> = {
  '@venizia/ignis-helpers': 'src/index.ts',
  '@venizia/ignis-helpers/core': 'src/core.ts',
  '@venizia/ignis-helpers/common': 'src/common/index.ts',
  '@venizia/ignis-helpers/uuid': 'src/uuid.ts',
  '@venizia/ignis-helpers/pino': 'src/modules/logger/pino/index.ts',
  '@venizia/ignis-helpers/winston': 'src/modules/logger/winston/index.ts',
  '@venizia/ignis-helpers/kafka': 'src/modules/queue/kafka/index.ts',
};

const loadModule = async (specifier: string): Promise<Record<string, unknown>> => {
  const source = SOURCES[specifier];
  if (!source) {
    throw new Error(`no source file is mapped to ${specifier}`);
  }

  return import(path.resolve(PACKAGE_ROOT, source));
};

describe('the helpers entries of the namespace-functions table', () => {
  test('the table is not empty', () => {
    expect(HELPERS_MAPPINGS.length).toBeGreaterThan(0);
  });

  test('no old name appears twice for the same module', () => {
    const seen = new Set<string>();
    const repeated: string[] = [];

    for (const entry of HELPERS_MAPPINGS) {
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

  for (const entry of HELPERS_MAPPINGS) {
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
