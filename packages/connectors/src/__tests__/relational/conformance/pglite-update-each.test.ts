import { datasource, model, type ITransaction } from '@venizia/ignis-kernel';
import { BasePostgresDataSource } from '@/relational/postgres/datasources';
import { PGliteDriver } from '@/relational/postgres/drivers/pglite';
import { BasePostgresEntity } from '@/relational/postgres/models';
import { SoftDeletableRepository } from '@/relational/postgres/repositories';
import { PGlite } from '@electric-sql/pglite';
import type { AnyType, ValueOrPromise } from '@venizia/ignis-helpers/common';
import { afterAll, beforeAll, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * `updateEach`: one update per row, each with its own data, in one transaction. Run against a real
 * Postgres engine (PGlite) so the audit stamps, the row scope and the transaction are the real ones.
 */
const TABLE_NAME = 'update_each_e2e';

const ME = 'm1';

/** Counts the statements that stamp a row: `$onUpdate` runs once per UPDATE statement. */
let stampCounter = 0;

const eachTable = pgTable(TABLE_NAME, {
  id: serial('id').primaryKey(),
  merchantId: text('merchant_id').notNull(),
  name: text('name').notNull(),
  price: integer('price').notNull(),
  secret: text('secret'),
  modifiedBy: text('modified_by').$onUpdate(() => `stamp-${++stampCounter}`),
  deletedAt: timestamp('deleted_at'),
});

@model({
  type: 'entity',
  settings: {
    hiddenProperties: ['secret'],
    access: {
      resolve: () => ({ merchantId: ME }),
    },
    query: { filter: { where: { deletedAt: null } } },
  },
})
class EachEntity extends BasePostgresEntity {
  static override TABLE_NAME = TABLE_NAME;
  static override schema = eachTable;
}

@datasource({ driver: PGliteDriver })
class EachDataSource extends BasePostgresDataSource<{}, AnyType, {}, PGlite> {
  constructor(opts: { client: PGlite }) {
    super({ name: EachDataSource.name, config: {}, schema: { [TABLE_NAME]: eachTable } });

    this.client = opts.client;
  }

  override configure(): ValueOrPromise<void> {}

  override getConnectionString(): ValueOrPromise<string> {
    return 'pglite://memory';
  }

  endDriver(): Promise<void> {
    return this.resolveDriver().end();
  }
}

/** Records the transaction each statement resolves its connector from. */
class RecordingRepository extends SoftDeletableRepository<typeof eachTable> {
  routedThrough: Array<ITransaction | undefined> = [];

  protected override resolveConnector(opts?: { transaction?: ITransaction }) {
    this.routedThrough.push(opts?.transaction);

    return super.resolveConnector(opts);
  }
}

let client: PGlite;
let dataSource: EachDataSource;
let repository: RecordingRepository;

beforeAll(async () => {
  client = new PGlite();
  await client.waitReady;

  await client.exec(`
    CREATE TABLE ${TABLE_NAME} (
      id serial primary key,
      merchant_id text not null,
      name text not null,
      price integer not null,
      secret text,
      modified_by text,
      deleted_at timestamp
    );
  `);

  dataSource = new EachDataSource({ client });
  repository = new RecordingRepository(dataSource as AnyType, {
    entityClass: EachEntity as AnyType,
  });
});

afterAll(async () => {
  await dataSource.endDriver();
});

/** id 1 and 2: mine. id 3: another merchant's. id 4: mine, soft-deleted. */
const seed = async (): Promise<void> => {
  await client.exec(`TRUNCATE TABLE ${TABLE_NAME} RESTART IDENTITY;`);
  await client.exec(`
    INSERT INTO ${TABLE_NAME} (merchant_id, name, price, secret, deleted_at) VALUES
      ('${ME}', 'a', 10, 's1', NULL),
      ('${ME}', 'b', 20, 's2', NULL),
      ('m2', 'c', 30, 's3', NULL),
      ('${ME}', 'd', 40, 's4', now());
  `);
};

interface IRawRow {
  id: number;
  name: string;
  price: number;
  modifiedBy: string | null;
}

const rawRows = async (): Promise<Array<IRawRow>> => {
  const { rows } = await client.query<IRawRow>(
    `SELECT id, name, price, modified_by AS "modifiedBy" FROM ${TABLE_NAME} ORDER BY id`,
  );

  return rows;
};

/** The message of the failure a call raised; fails when the call went through. */
const failureOf = async (opts: { run: Promise<unknown> }): Promise<string> => {
  try {
    await opts.run;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }

  throw new Error('expected the call to fail');
};

beforeEach(async () => {
  stampCounter = 0;
  repository.routedThrough = [];
  await seed();
});

describe('updateEach', () => {
  test('gives each row its own data, in the order given, and stamps each row', async () => {
    const result = await repository.updateEach({
      rows: [
        { id: 2, data: { name: 'b2', price: 22 } },
        { id: 1, data: { name: 'a2', price: 11 } },
      ],
    });

    expect(result.count).toBe(2);
    expect(result.data?.map((row) => row?.name)).toEqual(['b2', 'a2']);

    const rows = await rawRows();
    expect(rows.slice(0, 2).map((row) => [row.name, row.price])).toEqual([
      ['a2', 11],
      ['b2', 22],
    ]);
    // One UPDATE per row: the stamp is a new value for each.
    expect(rows[1].modifiedBy).toBe('stamp-1');
    expect(rows[0].modifiedBy).toBe('stamp-2');
  });

  test('a row outside the scope, or soft deleted, is null and adds nothing to the count', async () => {
    const result = await repository.updateEach({
      rows: [
        { id: 1, data: { name: 'a2' } },
        { id: 3, data: { name: 'foreign' } },
        { id: 4, data: { name: 'deleted' } },
        { id: 99, data: { name: 'missing' } },
      ],
    });

    expect(result.count).toBe(1);
    expect(result.data?.map((row) => row?.name ?? null)).toEqual(['a2', null, null, null]);

    const rows = await rawRows();
    expect(rows.map((row) => row.name)).toEqual(['a2', 'b', 'c', 'd']);
  });

  test('a payload outside the scope aborts the batch and nothing is written', async () => {
    const message = await failureOf({
      run: repository.updateEach({
        rows: [
          { id: 1, data: { name: 'a2' } },
          { id: 2, data: { merchantId: 'm9' } },
        ],
      }),
    });

    expect(message).toContain('write refused by the access scope');

    const rows = await rawRows();
    expect(rows.map((row) => row.name)).toEqual(['a', 'b', 'c', 'd']);
    expect(rows[0].modifiedBy).toBeNull();
  });

  test('hidden fields are not returned', async () => {
    const result = await repository.updateEach({ rows: [{ id: 1, data: { name: 'a2' } }] });

    expect(result.data?.[0]).not.toHaveProperty('secret');
    expect(result.data?.[0]).toHaveProperty('name', 'a2');
  });

  test('shouldReturn false returns the count and no rows', async () => {
    const result = await repository.updateEach({
      rows: [
        { id: 1, data: { name: 'a2' } },
        { id: 2, data: { name: 'b2' } },
      ],
      options: { shouldReturn: false },
    });

    expect(result).toEqual({ count: 2, data: null });
  });

  test('empty rows answer an empty list and open no transaction', async () => {
    const begin = spyOn(dataSource, 'beginTransaction');

    const result = await repository.updateEach({ rows: [] });

    const unreturned = await repository.updateEach({ rows: [], options: { shouldReturn: false } });

    expect(result).toEqual({ count: 0, data: [] });
    expect(unreturned).toEqual({ count: 0, data: null });
    expect(begin).not.toHaveBeenCalled();
    begin.mockRestore();
  });

  test('a null id is refused and the rows before it are not written', async () => {
    const message = await failureOf({
      run: repository.updateEach({
        rows: [
          { id: 1, data: { name: 'a2' } },
          // @ts-expect-error the id type does not admit null; the repository still has to refuse it
          { id: null, data: { name: 'x' } },
        ],
      }),
    });

    expect(message).toContain('id is null or undefined');

    const rows = await rawRows();
    expect(rows.map((row) => row.name)).toEqual(['a', 'b', 'c', 'd']);
  });

  test('every row is routed through the one transaction the repository began', async () => {
    const begin = spyOn(dataSource, 'beginTransaction');

    await repository.updateEach({
      rows: [
        { id: 1, data: { name: 'a2' } },
        { id: 2, data: { name: 'b2' } },
        { id: 3, data: { name: 'foreign' } },
      ],
    });

    const [began] = begin.mock.results;
    const transaction = await began.value;

    expect(begin).toHaveBeenCalledTimes(1);
    expect(repository.routedThrough).toHaveLength(3);

    for (const routed of repository.routedThrough) {
      expect(routed === transaction).toBe(true);
    }

    begin.mockRestore();
  });

  test("uses a caller's transaction and does not commit it", async () => {
    const transaction = await repository.beginTransaction();

    const result = await repository.updateEach({
      rows: [{ id: 1, data: { name: 'a2' } }],
      options: { transaction },
    });

    expect(result.count).toBe(1);
    expect(transaction.isActive).toBe(true);

    await transaction.rollback();

    const rows = await rawRows();
    expect(rows[0].name).toBe('a');
  });

  test("a caller's transaction that commits keeps the rows", async () => {
    const transaction = await repository.beginTransaction();

    await repository.updateEach({
      rows: [{ id: 1, data: { name: 'a2' } }],
      options: { transaction },
    });
    await transaction.commit();

    const rows = await rawRows();
    expect(rows[0].name).toBe('a2');
  });

  test('its own transaction commits at the end', async () => {
    const begin = spyOn(dataSource, 'beginTransaction');

    await repository.updateEach({
      rows: [
        { id: 1, data: { name: 'a2' } },
        { id: 2, data: { name: 'b2' } },
      ],
    });

    expect(begin).toHaveBeenCalledTimes(1);
    begin.mockRestore();

    const rows = await rawRows();
    expect(rows.slice(0, 2).map((row) => row.name)).toEqual(['a2', 'b2']);
  });
});
