import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, test } from 'bun:test';

/**
 * The codemod table of this package (`devz codemod namespace-functions`) against the real exports:
 * the old name is still a function, the class has the method, and the old call and the new call
 * agree. The table is read from its source by path, not through a package import.
 */
const ROOT = resolve(import.meta.dir, '../../../..');
const MAPPING_FILE = join(
  ROOT,
  'packages/dev-configs/src/cli/codemod/namespace-functions/mappings/inversion.ts',
);
const HELPERS_RESOLVERS = join(ROOT, 'packages/helpers/src/common/resolvers.ts');

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

const entry: Record<string, unknown> = await import('../index');

/** The module specifiers that resolve to this package's own entry. */
const OWN_ENTRY = '@venizia/ignis-inversion';

class SampleTarget {}

/** A sample call of the old form, per old name: its positional arguments. */
const SAMPLES: Record<string, () => unknown[]> = {
  isEmpty: () => [{ value: {} }],
  omit: () => [{ source: { a: 1, b: 2 }, keys: ['a'] }],
  resolveValue: () => [{ value: () => 1 }],
  resolveValueAsync: () => [{ value: async () => 2 }],
  resolveInjectTarget: () => [{ target: () => SampleTarget }],
  verifyBindings: () => [{ container: new (entry.Container as any)(), namespaces: ['x'] }],
  assertBindingsResolve: () => [
    { container: new (entry.Container as any)(), namespaces: ['x'], scope: 'sample' },
  ],
};

/** The options object the new form takes, built from the old positional arguments and `params`. */
const toOptions = (mapping: IMapping, args: unknown[]): unknown => {
  if (mapping.keepsOptions) {
    return args[0];
  }

  const options: Record<string, unknown> = {};
  mapping.params.forEach((parameter, index) => {
    if (index < args.length) {
      options[parameter.key] = args[index];
    }
  });
  return options;
};

describe('the inversion mapping table', () => {
  test('it has entries, and every entry has a sample', () => {
    expect(INVERSION_MAPPINGS.length).toBeGreaterThan(0);
    for (const mapping of INVERSION_MAPPINGS) {
      expect(SAMPLES[mapping.oldName]).toBeDefined();
    }
  });

  for (const mapping of INVERSION_MAPPINGS) {
    test(`${mapping.oldName} -> ${mapping.className}.${mapping.method}`, async () => {
      const oldFunction = entry[mapping.oldName];
      const classRef = entry[mapping.className] as Record<string, unknown> | undefined;

      expect(typeof oldFunction).toBe('function');
      expect(typeof classRef?.[mapping.method]).toBe('function');

      const args = SAMPLES[mapping.oldName]!();
      const fromOld = await Reflect.apply(oldFunction as () => unknown, undefined, args);
      const fromNew = await (classRef![mapping.method] as (opts: unknown) => unknown)(
        toOptions(mapping, args),
      );

      expect(fromNew).toEqual(fromOld);
    });
  }

  test('every specifier is this package or a helpers entry that re-exports the old name and the class', () => {
    const helpers = readFileSync(HELPERS_RESOLVERS, 'utf8');

    for (const mapping of INVERSION_MAPPINGS) {
      for (const module of mapping.modules) {
        if (module === OWN_ENTRY) {
          continue;
        }

        expect(['@venizia/ignis-helpers', '@venizia/ignis-helpers/common']).toContain(module);
        expect(helpers).toMatch(new RegExp(`\\b${mapping.oldName}\\b`));
        expect(helpers).toMatch(new RegExp(`\\b${mapping.className}\\b`));
      }
    }
  });
});
