import { describe, expect, spyOn, test } from 'bun:test';
import path from 'node:path';
import { getTableName } from 'drizzle-orm';
import { pgTable, serial, text } from 'drizzle-orm/pg-core';
import {
  DefaultCRUDRepository,
  IsolationLevels,
  type IDatabaseExtraOptions,
} from '@venizia/ignis-connectors/postgres';
import { PostgresTransactionDouble, TransactionStates } from '@/testing';

/**
 * `@venizia/ignis/testing` re-exports `@venizia/ignis-connectors/testing`. Both are proved through
 * the package name, which resolves into `dist`: rebuild connectors, then this package, before
 * trusting these results. Specifiers are held in variables so `tsc` never resolves this package's
 * own `dist` while a rebuild has just emptied it.
 */
const TESTING_ENTRY: string = '@venizia/ignis/testing';
const CONNECTORS_TESTING_ENTRY: string = '@venizia/ignis-connectors/testing';
const ROOT_ENTRY: string = '@venizia/ignis';

const TESTING_EXPORTS = [
  'TransactionDouble',
  'PostgresTransactionDouble',
  'SqliteTransactionDouble',
  'TransactionStates',
];

// `__dirname`, not `import.meta`: this package emits CommonJS.
const PACKAGE_ROOT = path.resolve(__dirname, '../../..');

const importEntry = async (opts: { specifier: string }): Promise<Record<string, unknown>> => {
  const entry: Record<string, unknown> = await import(opts.specifier);
  return entry;
};

describe('@venizia/ignis/testing', () => {
  test('resolves to the built entry', () => {
    const resolved = Bun.resolveSync(TESTING_ENTRY, __dirname);

    expect(resolved).toBe(path.join(PACKAGE_ROOT, 'dist/testing/index.js'));
  });

  /**
   * Names, not identity: this package loads the connectors CommonJS build while an `import` here
   * loads its ESM build, so the two class objects differ as they do for every re-exported sub-path.
   * A CommonJS module also surfaces a synthetic `default`, which is not an export.
   */
  test('re-exports exactly the connectors testing entry', async () => {
    const entry = await importEntry({ specifier: TESTING_ENTRY });
    const connectorsEntry = await importEntry({ specifier: CONNECTORS_TESTING_ENTRY });

    for (const name of TESTING_EXPORTS) {
      expect(typeof entry[name]).toBe('function');
    }

    const namesOf = (source: Record<string, unknown>) =>
      Object.keys(source)
        .filter(key => key !== 'default')
        .sort();

    expect(namesOf(entry)).toEqual(namesOf(connectorsEntry));
  });

  test('the root barrel does not export any of them', async () => {
    const root = await importEntry({ specifier: ROOT_ENTRY });
    const exported = Object.keys(root);

    // Positive control: the root really loaded, so an empty intersection means something.
    expect(exported).toContain('BaseApplication');

    for (const name of TESTING_EXPORTS) {
      expect({ name, isExported: exported.includes(name) }).toEqual({ name, isExported: false });
    }
  });
});

const itemTable = pgTable('testing_entry_item', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
});

/**
 * The consumer's view: a repository from the published surface stubbed with the double from
 * `@venizia/ignis/testing`. `tsc --noEmit -p tsconfig.json` in this package is the real check -
 * every line compiles with no cast.
 */
describe('Cast-free stubbing from a consumer test', () => {
  test('spyOn(repository, beginTransaction).mockResolvedValue(double) and runInTransaction', async () => {
    const repository = new DefaultCRUDRepository<typeof itemTable>();
    const double = new PostgresTransactionDouble({ isolationLevel: IsolationLevels.SERIALIZABLE });

    spyOn(repository, 'beginTransaction').mockResolvedValue(double);

    const result = await repository.runInTransaction({
      execute: async ({ transaction }) => transaction.isolationLevel,
    });

    expect(result).toBe(IsolationLevels.SERIALIZABLE);
    expect(double.state).toBe(TransactionStates.COMMITTED);
    // The fixture is a real Drizzle table, not a type-only stand-in.
    expect(getTableName(itemTable)).toBe('testing_entry_item');
  });

  test('options: { transaction: double } is a valid Postgres extra option', () => {
    const double = new PostgresTransactionDouble();
    const options: IDatabaseExtraOptions = { transaction: double };

    expect(options.transaction).toBe(double);
  });
});
