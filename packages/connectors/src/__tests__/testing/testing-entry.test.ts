import { Glob } from 'bun';
import { describe, expect, test } from 'bun:test';
import path from 'node:path';

/**
 * `@venizia/ignis-connectors/testing` is a published sub-path, so it is proved through the package
 * name - which resolves through the `import` condition into `dist/esm`, not `src`. Rebuild this
 * package before trusting these results. Specifiers are held in variables so `tsc` never resolves
 * the package's own `dist` while a rebuild has just emptied it.
 */
const TESTING_ENTRY: string = '@venizia/ignis-connectors/testing';

const TESTING_EXPORTS = [
  'TransactionDouble',
  'PostgresTransactionDouble',
  'SqliteTransactionDouble',
  'TransactionStates',
];

/** Every other entry that is a barrel; none may carry the double. */
const OTHER_BARRELS: string[] = [
  '@venizia/ignis-connectors',
  '@venizia/ignis-connectors/relational',
  '@venizia/ignis-connectors/postgres',
  '@venizia/ignis-connectors/sqlite',
];

// `__dirname`, not `import.meta`: this package emits CommonJS.
const PACKAGE_ROOT = path.resolve(__dirname, '../../..');

const importEntry = async (opts: { specifier: string }): Promise<Record<string, unknown>> => {
  const entry: Record<string, unknown> = await import(opts.specifier);
  return entry;
};

describe('@venizia/ignis-connectors/testing', () => {
  test('resolves to the built ESM entry', () => {
    const resolved = Bun.resolveSync(TESTING_ENTRY, __dirname);

    expect(resolved).toBe(path.join(PACKAGE_ROOT, 'dist/esm/testing/index.js'));
  });

  test('exports the double, the engine doubles and TransactionStates', async () => {
    const entry = await importEntry({ specifier: TESTING_ENTRY });

    for (const name of TESTING_EXPORTS) {
      expect(typeof entry[name]).toBe('function');
    }
  });

  test('no other barrel exports any of them', async () => {
    for (const specifier of OTHER_BARRELS) {
      const barrel = await importEntry({ specifier });
      const exported = Object.keys(barrel);

      // Positive control: the barrel really loaded, so an empty intersection means something.
      expect(exported.length).toBeGreaterThan(0);

      for (const name of TESTING_EXPORTS) {
        expect({ specifier, name, isExported: exported.includes(name) }).toEqual({
          specifier,
          name,
          isExported: false,
        });
      }
    }
  });
});

describe('production code never imports the testing entry', () => {
  const TESTING_IMPORT = /from\s+['"](?:@\/testing|@venizia\/ignis-connectors\/testing)['"]/;

  const findImporters = async (opts: { pattern: string }): Promise<string[]> => {
    const importers: string[] = [];
    const glob = new Glob(opts.pattern);

    for await (const file of glob.scan({ cwd: path.join(PACKAGE_ROOT, 'src') })) {
      const source = await Bun.file(path.join(PACKAGE_ROOT, 'src', file)).text();

      if (TESTING_IMPORT.test(source)) {
        importers.push(file);
      }
    }

    return importers;
  };

  test('no file outside src/testing and __tests__ imports it', async () => {
    const importers = await findImporters({ pattern: '**/*.ts' });
    const production = importers.filter(
      file => !file.startsWith('testing/') && !file.includes('__tests__/'),
    );

    expect(production).toEqual([]);
  });

  test('the scan finds the tests that do import it - it can see an importer', async () => {
    const importers = await findImporters({ pattern: '__tests__/**/*.ts' });

    expect(importers.length).toBeGreaterThan(0);
  });
});
