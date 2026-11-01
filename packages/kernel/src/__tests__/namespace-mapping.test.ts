import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * The functions of `@venizia/ignis-kernel` that moved into classes, and the codemod table that is the
 * only upgrade path for their old names (`devz codemod namespace-functions`): every entry names a class
 * method that exists, and the old name is no longer exported from any entry the table lists.
 */

interface IMappingEntry {
  modules: string[];
  oldName: string;
  className: string;
  method: string;
  newModules?: string[];
  params: Array<{ key: string; optional?: boolean }>;
  keepsOptions?: boolean;
}

/** The repository root: the nearest parent that holds the dev-configs package (tests run from the package or from the root). */
const findRoot = (): string => {
  let current = process.cwd();
  while (!existsSync(join(current, 'packages/dev-configs/package.json'))) {
    const parent = dirname(current);
    if (parent === current) {
      throw new Error(`[namespace-mapping] Repository root not found from ${process.cwd()}`);
    }
    current = parent;
  }
  return current;
};

const REPOSITORY_ROOT = findRoot();
const MAPPING_SOURCE = join(
  REPOSITORY_ROOT,
  'packages/dev-configs/src/cli/codemod/namespace-functions/mappings/kernel.ts',
);

/** `@venizia/ignis` re-exports the whole kernel root, which is what makes it right to list beside the kernel root. */
const CORE_SERVER_INDEX = join(REPOSITORY_ROOT, 'packages/core-server/src/index.ts');
const CORE_SERVER_SPECIFIER = '@venizia/ignis';

/** The module specifier of each kernel entry the table names, loaded from the source file behind it. */
const loadModule = async (specifier: string): Promise<Record<string, unknown>> => {
  switch (specifier) {
    case '@venizia/ignis-kernel': {
      return import('../index');
    }
    case '@venizia/ignis-kernel/metadata': {
      return import('../metadata');
    }
    case '@venizia/ignis-kernel/repository': {
      return import('../repository');
    }
    default: {
      throw new Error(`no source file is mapped to ${specifier}`);
    }
  }
};

const loaded: { KERNEL_MAPPINGS: ReadonlyArray<IMappingEntry> } = await import(MAPPING_SOURCE);
const { KERNEL_MAPPINGS } = loaded;

describe('the kernel entries of the namespace-functions table', () => {
  test('the table is not empty', () => {
    expect(KERNEL_MAPPINGS.length).toBeGreaterThan(0);
  });

  test('no old name appears twice for the same module', () => {
    const seen = new Set<string>();
    const repeated: string[] = [];

    for (const entry of KERNEL_MAPPINGS) {
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

  test('@venizia/ignis re-exports the kernel root', () => {
    expect(readFileSync(CORE_SERVER_INDEX, 'utf8')).toContain(
      "export * from '@venizia/ignis-kernel';",
    );
  });

  for (const entry of KERNEL_MAPPINGS) {
    describe(`${entry.oldName} -> ${entry.className}.${entry.method}`, () => {
      for (const specifier of entry.modules) {
        if (specifier === CORE_SERVER_SPECIFIER) {
          continue;
        }

        test(`from ${specifier}: the old name is gone`, async () => {
          const moduleExports = await loadModule(specifier);

          expect(moduleExports[entry.oldName]).toBeUndefined();
        });
      }

      test('the class has the static method, in every module listed', async () => {
        const specifiers = (entry.newModules ?? entry.modules).filter(
          (specifier) => specifier !== CORE_SERVER_SPECIFIER,
        );

        for (const specifier of specifiers) {
          const classModule = await loadModule(specifier);
          const klass = classModule[entry.className] as Record<string, unknown> | undefined;

          expect(typeof klass, `${specifier} exports ${entry.className}`).toBe('function');
          expect(typeof klass?.[entry.method]).toBe('function');
        }
      });
    });
  }
});
