import { afterAll, beforeAll, describe, expect, spyOn, test } from 'bun:test';
import { PGlite } from '@electric-sql/pglite';
import { pgTable, serial, text } from 'drizzle-orm/pg-core';
import {
  DefaultCRUDRepository,
  type IDatabaseExtraOptions,
  type TTableInsert,
  type TTableObject,
} from '@venizia/ignis-connectors/postgres';
import type * as ConnectorsPostgresEntry from '@venizia/ignis-connectors/postgres';
import type * as PGliteDriverEntry from '@venizia/ignis-connectors/postgres/pglite';
import { isApplicationError } from '@venizia/ignis-helpers/core';
import type * as TestingEntry from '@/testing';
import * as esmTesting from '@/testing';

/**
 * This package runs as CommonJS and loads the connectors CommonJS build, while an `import` of
 * `@venizia/ignis-connectors/*` here loads the connectors ESM build. A consumer that mixes the two
 * entry families therefore holds classes from two module copies. A handle or double from one copy
 * must still be recognised by a repository from the other: when `execute` commits the owned
 * transaction itself, runInTransaction returns its result.
 *
 * Specifiers are held in variables so `tsc` never resolves this package's own `dist`.
 */
const CJS_TESTING_ENTRY: string = '@venizia/ignis/testing';
const CJS_POSTGRES_ENTRY: string = '@venizia/ignis/postgres';
const CJS_PGLITE_ENTRY: string = '@venizia/ignis/postgres/pglite';

const EXECUTE_ENDED_MESSAGE = /^\[[A-Za-z]+\]\[runInTransaction\] .*execute/;

const TABLE_NAME = 'cross_copy_item';

const itemTable = pgTable(TABLE_NAME, {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
});

let cjsTesting: typeof TestingEntry;
let cjsPostgres: typeof ConnectorsPostgresEntry;
let cjsPGlite: typeof PGliteDriverEntry;

beforeAll(async () => {
  cjsTesting = await import(CJS_TESTING_ENTRY);
  cjsPostgres = await import(CJS_POSTGRES_ENTRY);
  cjsPGlite = await import(CJS_PGLITE_ENTRY);
});

describe('The two module copies really are different', () => {
  test('positive control: the CommonJS and ESM copies hand out different class objects', () => {
    expect(cjsTesting.TransactionDouble).not.toBe(esmTesting.TransactionDouble);
    expect(cjsPostgres.DefaultCRUDRepository).not.toBe(DefaultCRUDRepository);
  });
});

describe('A double from one copy, a repository from the other', () => {
  test('CommonJS double, ESM repository: execute commits it, runInTransaction returns the result', async () => {
    const repository = new DefaultCRUDRepository<typeof itemTable>();
    const double = new cjsTesting.PostgresTransactionDouble();
    spyOn(repository, 'beginTransaction').mockResolvedValue(double);

    const result = await repository.runInTransaction({
      execute: async ({ transaction }) => {
        await transaction.commit();
        return 'execute-result';
      },
    });

    expect(result).toBe('execute-result');
    expect(double.commitCount).toBe(1);
    expect(double.state).toBe(cjsTesting.TransactionStates.COMMITTED);
  });

  test('ESM double, CommonJS repository: execute commits it, runInTransaction returns the result', async () => {
    const repository = new cjsPostgres.DefaultCRUDRepository<typeof itemTable>();
    const double = new esmTesting.PostgresTransactionDouble();
    spyOn(repository, 'beginTransaction').mockResolvedValue(double);

    const result = await repository.runInTransaction({
      execute: async ({ transaction }) => {
        await transaction.commit();
        return 'execute-result';
      },
    });

    expect(result).toBe('execute-result');
    expect(double.commitCount).toBe(1);
  });

  test('CommonJS double, ESM repository: execute rolls it back, runInTransaction throws the execute-ended error', async () => {
    const repository = new DefaultCRUDRepository<typeof itemTable>();
    const double = new cjsTesting.PostgresTransactionDouble();
    spyOn(repository, 'beginTransaction').mockResolvedValue(double);

    let caught: unknown;
    try {
      await repository.runInTransaction({
        execute: async ({ transaction }) => {
          await transaction.rollback();
          return 'execute-result';
        },
      });
    } catch (error) {
      caught = error;
    }

    expect(isApplicationError(caught)).toBe(true);
    expect(caught).toMatchObject({ message: expect.stringMatching(EXECUTE_ENDED_MESSAGE) });
    expect(double.rollbackCount).toBe(1);
  });
});

/** A real handle from a CommonJS datasource, ended by execute, under an ESM repository. */
describe('A real handle from one copy, a repository from the other', () => {
  const schema = { [TABLE_NAME]: itemTable };

  let client: PGlite;
  let dataSource: ConnectorsPostgresEntry.BasePostgresDataSource<{}, typeof schema, {}, PGlite>;

  beforeAll(async () => {
    client = new PGlite();
    await client.waitReady;
    await client.exec(`CREATE TABLE ${TABLE_NAME} (id serial primary key, name text not null)`);

    const { BasePostgresDataSource: CjsBasePostgresDataSource } = cjsPostgres;
    const { PGliteDriver: CjsPGliteDriver } = cjsPGlite;
    const pglite = client;

    class CrossCopyDataSource extends CjsBasePostgresDataSource<{}, typeof schema, {}, PGlite> {
      constructor() {
        super({ name: 'CrossCopyDataSource', config: {}, schema });
        this.client = pglite;
      }

      override configure(): void {
        this.useDriver({ driver: new CjsPGliteDriver<typeof schema>({ client: pglite }) });
      }

      override getConnectionString(): string {
        return 'pglite://memory';
      }
    }

    const crossCopy = new CrossCopyDataSource();
    crossCopy.configure();
    dataSource = crossCopy;
  });

  afterAll(async () => {
    await dataSource.close();
  });

  const buildRepository = () =>
    new DefaultCRUDRepository<
      typeof itemTable,
      TTableObject<typeof itemTable>,
      TTableInsert<typeof itemTable>,
      IDatabaseExtraOptions,
      typeof dataSource
    >(dataSource);

  test('positive control: the datasource is the CommonJS class', () => {
    expect(dataSource).toBeInstanceOf(cjsPostgres.BasePostgresDataSource);
  });

  test('execute commits the real handle itself: runInTransaction returns the result', async () => {
    const repository = buildRepository();

    const result = await repository.runInTransaction({
      execute: async ({ transaction }) => {
        await transaction.commit();
        return 'execute-result';
      },
    });

    expect(result).toBe('execute-result');
  });

  test('execute rolls the real handle back itself: runInTransaction throws the execute-ended error', async () => {
    const repository = buildRepository();

    let caught: unknown;
    try {
      await repository.runInTransaction({
        execute: async ({ transaction }) => {
          await transaction.rollback();
          return 'execute-result';
        },
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toMatchObject({ message: expect.stringMatching(EXECUTE_ENDED_MESSAGE) });
  });
});
