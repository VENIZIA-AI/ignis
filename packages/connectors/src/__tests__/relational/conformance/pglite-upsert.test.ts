import { PGlite } from '@electric-sql/pglite';
import type { AnyType, ValueOrPromise } from '@venizia/ignis-helpers/common';
import { datasource, model, ScopeWriteGuards, type TScopeOperation } from '@venizia/ignis-kernel';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { sql } from 'drizzle-orm';
import { index, pgTable, serial, text, timestamp, unique, uniqueIndex } from 'drizzle-orm/pg-core';
import { UniqueKeys } from '@/relational/core/models';
import { BasePostgresDataSource } from '@/relational/postgres/datasources';
import { PGliteDriver } from '@/relational/postgres/drivers/pglite';
import { BasePostgresEntity } from '@/relational/postgres/models';
import { DefaultCRUDRepository } from '@/relational/postgres/repositories';
import { defineUpsertCases, type IUpsertRow } from './upsert-cases';

/** `upsert` on a real Postgres engine (PGlite); the cases are shared with libsql. */
const TABLE_NAME = 'upsert_pg_item';
const NND_TABLE = 'upsert_pg_nnd';

let tick = 0;

const columns = () => ({
  id: serial('id').primaryKey(),
  merchantId: text('merchant_id'),
  code: text('code').notNull(),
  slug: text('slug'),
  name: text('name'),
  value: text('value'),
  secret: text('secret'),
  status: text('status').notNull().default('NEW'),
  createdAt: text('created_at').$defaultFn(() => 'created'),
  modifiedAt: text('modified_at')
    .$defaultFn(() => 'created')
    .$onUpdate(() => `updated-${++tick}`),
  deletedAt: timestamp('deleted_at'),
});

const itemTable = pgTable(TABLE_NAME, columns(), (table) => [
  uniqueIndex('upsert_pg_item_code').on(table.code),
  uniqueIndex('upsert_pg_item_merchant_slug')
    .on(table.merchantId, table.slug)
    .where(sql`${table.deletedAt} is null`),
  index('upsert_pg_item_value').on(table.value),
]);

/** Same column names as `itemTable`, another table: its key must not be accepted by `itemTable`'s repository. */
const twinTable = pgTable('upsert_pg_twin', columns(), (table) => [
  uniqueIndex('upsert_pg_twin_code').on(table.code),
]);

const nndTable = pgTable(
  NND_TABLE,
  { id: serial('id').primaryKey(), a: text('a').notNull(), b: text('b'), value: text('value') },
  (table) => [unique('upsert_pg_nnd_ab').on(table.a, table.b).nullsNotDistinct()],
);

let resolver: (context: { operation: TScopeOperation }) => AnyType = () => ({});

const SETTINGS = {
  hiddenProperties: ['secret'],
  query: { filter: { where: { deletedAt: null } } },
};

@model({
  type: 'entity',
  settings: { ...SETTINGS, access: { resolve: (context) => resolver(context) } },
})
class UpsertItem extends BasePostgresEntity {
  static override TABLE_NAME = TABLE_NAME;
  static override schema = itemTable;
}

@model({
  type: 'entity',
  settings: {
    ...SETTINGS,
    access: {
      resolve: (context) => resolver(context),
      write: { mode: ScopeWriteGuards.ASSIGN },
    },
  },
})
class UpsertAssignItem extends BasePostgresEntity {
  static override TABLE_NAME = TABLE_NAME;
  static override schema = itemTable;
}

@model({ type: 'entity' })
class UpsertNnd extends BasePostgresEntity {
  static override TABLE_NAME = NND_TABLE;
  static override schema = nndTable;
}

@datasource({ driver: PGliteDriver })
class UpsertDataSource extends BasePostgresDataSource<{}, AnyType, {}, PGlite> {
  constructor(opts: { client: PGlite }) {
    super({
      name: UpsertDataSource.name,
      config: {},
      schema: { [TABLE_NAME]: itemTable, [NND_TABLE]: nndTable },
    });

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

let client: PGlite;
let dataSource: UpsertDataSource;
let items: DefaultCRUDRepository<typeof itemTable>;
let assignItems: DefaultCRUDRepository<typeof itemTable>;
let nnd: DefaultCRUDRepository<typeof nndTable>;

beforeAll(async () => {
  client = new PGlite();
  await client.waitReady;
  // The database's arbiters come from this DDL, the repository's target from the Drizzle table: both declare the same keys.
  await client.exec(`
    CREATE TABLE ${TABLE_NAME} (
      id serial primary key,
      merchant_id text,
      code text not null,
      slug text,
      name text,
      value text,
      secret text,
      status text not null default 'NEW',
      created_at text,
      modified_at text,
      deleted_at timestamp
    );
    CREATE UNIQUE INDEX upsert_pg_item_code ON ${TABLE_NAME} (code);
    CREATE UNIQUE INDEX upsert_pg_item_merchant_slug ON ${TABLE_NAME} (merchant_id, slug) WHERE deleted_at IS NULL;
    CREATE INDEX upsert_pg_item_value ON ${TABLE_NAME} (value);
    CREATE TABLE ${NND_TABLE} (
      id serial primary key,
      a text not null,
      b text,
      value text,
      constraint upsert_pg_nnd_ab unique nulls not distinct (a, b)
    );
  `);

  dataSource = new UpsertDataSource({ client });
  items = new DefaultCRUDRepository<typeof itemTable>(dataSource as AnyType, {
    entityClass: UpsertItem as AnyType,
  });
  assignItems = new DefaultCRUDRepository<typeof itemTable>(dataSource as AnyType, {
    entityClass: UpsertAssignItem as AnyType,
  });
  nnd = new DefaultCRUDRepository<typeof nndTable>(dataSource as AnyType, {
    entityClass: UpsertNnd as AnyType,
  });
}, 30_000);

afterAll(async () => {
  await dataSource.endDriver();
});

defineUpsertCases(() => ({
  items,
  assignItems,
  codeKey: UniqueKeys.of({ table: itemTable, index: 'upsert_pg_item_code' }),
  slugKey: UniqueKeys.of({ table: itemTable, index: 'upsert_pg_item_merchant_slug' }),
  foreignKey: UniqueKeys.of({ table: twinTable, index: 'upsert_pg_twin_code' }),
  executor: dataSource.getQueryExecutor(),
  setResolver: (next) => {
    resolver = next;
  },
  reset: async () => {
    await client.exec(`TRUNCATE TABLE ${TABLE_NAME} RESTART IDENTITY;`);
    await client.exec(`
      INSERT INTO ${TABLE_NAME} (merchant_id, code, slug, name, value, secret, status, created_at, modified_at, deleted_at) VALUES
        ('m1', 'A', 'a', 'a', 'v1', 's1', 'OLD', 'seed', 'seed', NULL),
        ('m2', 'B', 'b', 'b', 'v2', 's2', 'OLD', 'seed', 'seed', NULL),
        ('m1', 'C', 'c', 'c', 'v3', 's3', 'OLD', 'seed', 'seed', now()),
        (NULL, 'S', 's', 's', 'v4', 's4', 'OLD', 'seed', 'seed', NULL);
    `);
  },
  rawRows: async () => {
    const { rows } = await client.query<AnyType>(`SELECT * FROM ${TABLE_NAME} ORDER BY id`);

    return rows.map((row): IUpsertRow => ({
      id: Number(row.id),
      merchantId: row.merchant_id,
      code: row.code,
      slug: row.slug,
      name: row.name,
      value: row.value,
      secret: row.secret,
      status: row.status,
      createdAt: row.created_at,
      modifiedAt: row.modified_at,
      isDeleted: row.deleted_at !== null,
    }));
  },
}));

describe('upsert - a NULLS NOT DISTINCT key (Postgres only)', () => {
  test('a null key column is accepted and a second upsert of it updates the same row', async () => {
    const key = UniqueKeys.of({ table: nndTable, index: 'upsert_pg_nnd_ab' });

    expect(key.nullsNotDistinct).toBe(true);

    const first = await nnd.upsert({ data: { a: 'x', b: null, value: '1' }, on: key });
    const second = await nnd.upsert({ data: { a: 'x', b: null, value: '2' }, on: key });
    const { rows } = await client.query<AnyType>(`SELECT a, b, value FROM ${NND_TABLE}`);

    expect(first.data).toMatchObject({ value: '1' });
    expect(second.data).toMatchObject({ id: first.data.id, value: '2' });
    expect(rows).toEqual([{ a: 'x', b: null, value: '2' }]);
  });
});
