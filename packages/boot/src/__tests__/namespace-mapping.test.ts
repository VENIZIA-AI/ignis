import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, test } from 'bun:test';

/**
 * The codemod table of this package (`devz codemod namespace-functions`) against the real exports:
 * the old name is still a function, the class has the method, and the old call and the new call
 * agree. The table is read from its source by path, not through a package import.
 */
const ROOT = resolve(import.meta.dir, '../../../..');
const MAPPING_FILE = join(
  ROOT,
  'packages/dev-configs/src/cli/codemod/namespace-functions/mappings/boot.ts',
);
const FIXTURES = resolve(import.meta.dir, 'fixtures', 'artifacts');

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

const directories: string[] = [];
const outputFile = (name: string): string => {
  const directory = mkdtempSync(join(tmpdir(), 'ignis-boot-mapping-'));
  directories.push(directory);
  return join(directory, name);
};

afterAll(() => {
  for (const directory of directories) {
    rmSync(directory, { recursive: true, force: true });
  }
});

/** A sample call of the old form, per old name: its positional arguments. A fresh output file each time. */
const SAMPLES: Record<string, () => unknown[]> = {
  generateArtifactIndex: () => [{ root: FIXTURES, out: outputFile('artifacts.ts') }],
  checkArtifactIndex: () => [{ root: FIXTURES, out: join(FIXTURES, 'no-such-index.ts') }],
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

describe('the boot mapping table', () => {
  test('it has entries, and every entry has a sample', () => {
    expect(BOOT_MAPPINGS.length).toBeGreaterThan(0);
    for (const mapping of BOOT_MAPPINGS) {
      expect(SAMPLES[mapping.oldName]).toBeDefined();
    }
  });

  for (const mapping of BOOT_MAPPINGS) {
    test(`${mapping.oldName} -> ${mapping.className}.${mapping.method}`, async () => {
      expect(mapping.modules.every((module) => module in ENTRIES)).toBe(true);

      for (const module of mapping.modules) {
        const entry = await ENTRIES[module]!();
        const classRef = entry[mapping.className] as Record<string, unknown> | undefined;

        expect(typeof entry[mapping.oldName]).toBe('function');
        expect(typeof classRef?.[mapping.method]).toBe('function');
      }

      const entry = await ENTRIES[mapping.modules[0]!]!();
      const classRef = entry[mapping.className] as Record<string, unknown>;
      const fromOld = Reflect.apply(
        entry[mapping.oldName] as () => unknown,
        undefined,
        SAMPLES[mapping.oldName]!(),
      ) as Record<string, unknown>;
      const fromNew = (classRef[mapping.method] as (opts: unknown) => unknown)(
        toOptions(mapping, SAMPLES[mapping.oldName]!()),
      ) as Record<string, unknown>;

      // The header of a generated file records its path, so the two output files differ in `content`.
      expect(Object.keys(fromNew)).toEqual(Object.keys(fromOld));
      expect(fromNew.artifacts ?? fromNew.expected).toBeDefined();
      if ('artifacts' in fromOld) {
        expect(fromNew.artifacts).toEqual(fromOld.artifacts);
        expect(fromNew.written).toBe(fromOld.written);
      } else {
        expect(fromNew).toEqual(fromOld);
      }
    });
  }
});
