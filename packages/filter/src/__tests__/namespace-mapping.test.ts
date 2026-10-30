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

/** The src module behind each specifier of this package. The kernel and the core server re-export `.`. */
const ENTRIES: Record<string, () => Promise<Record<string, unknown>>> = {
  '@venizia/ignis-filter': () => import('../index'),
  '@venizia/ignis-filter/schemas': () => import('../schemas'),
};
const RE_EXPORTERS = ['@venizia/ignis-kernel', '@venizia/ignis'];

/** A sample call of the old form, per old name: its positional arguments. */
const SAMPLES: Record<string, () => unknown[]> = {
  parseOrderEntry: () => [{ entry: ' name  DESC ' }],
  buildQuerySchemas: () => [{}],
};

/** Compares two results; the schemas are objects of zod types, so their key sets and parses are compared. */
const same = (fromOld: unknown, fromNew: unknown): void => {
  if (fromOld !== null && typeof fromOld === 'object' && 'FilterSchema' in fromOld) {
    const left = fromOld as Record<string, { safeParse: (value: unknown) => unknown }>;
    const right = fromNew as typeof left;
    expect(Object.keys(right)).toEqual(Object.keys(left));
    const input = { where: { a: 1 }, limit: 3 };
    expect(right.FilterSchema!.safeParse(input)).toEqual(left.FilterSchema!.safeParse(input));
    return;
  }

  expect(fromNew).toEqual(fromOld);
};

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

describe('the filter mapping table', () => {
  test('it has entries, and every entry has a sample', () => {
    expect(FILTER_MAPPINGS.length).toBeGreaterThan(0);
    for (const mapping of FILTER_MAPPINGS) {
      expect(SAMPLES[mapping.oldName]).toBeDefined();
    }
  });

  for (const mapping of FILTER_MAPPINGS) {
    test(`${mapping.oldName} -> ${mapping.className}.${mapping.method}`, async () => {
      const own = mapping.modules.filter((module) => module in ENTRIES);
      expect(own.length).toBeGreaterThan(0);
      expect(
        mapping.modules.filter((module) => !(module in ENTRIES) && !RE_EXPORTERS.includes(module)),
      ).toEqual([]);

      const entry = await ENTRIES[own[0]!]!();
      const oldFunction = entry[mapping.oldName];
      const classRef = entry[mapping.className] as Record<string, unknown> | undefined;

      expect(typeof oldFunction).toBe('function');
      expect(typeof classRef?.[mapping.method]).toBe('function');

      const args = SAMPLES[mapping.oldName]!();
      const fromOld = Reflect.apply(oldFunction as () => unknown, undefined, args);
      const fromNew = (classRef![mapping.method] as (opts: unknown) => unknown)(
        toOptions(mapping, args),
      );

      same(fromOld, fromNew);
    });
  }

  test('the old and the new form throw the same error', async () => {
    const failure = (run: () => unknown): string => {
      try {
        run();
      } catch (error) {
        return (error as Error).message;
      }
      return '';
    };

    const bad = { entry: 'name SIDEWAYS' };
    const { parseOrderEntry, Sorts } = await import('../index');
    const message = failure(() => parseOrderEntry(bad));

    expect(message).toContain('Invalid direction');
    expect(failure(() => Sorts.parseEntry(bad))).toBe(message);
  });
});
