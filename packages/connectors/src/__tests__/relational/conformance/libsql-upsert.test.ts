import type { Client } from '@libsql/client';
import { createClient } from '@libsql/client';
import type { AnyType, ValueOrPromise } from '@venizia/ignis-helpers/common';
import { datasource, model, ScopeWriteGuards, type TScopeOperation } from '@venizia/ignis-kernel';
import { afterAll, beforeAll } from 'bun:test';
import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { UniqueKeys } from '@/relational/core/models';
import { BaseSqliteDataSource } from '@/relational/sqlite/datasources';
import { LibSqlDriver } from '@/relational/sqlite/drivers/libsql';
import { BaseSqliteEntity } from '@/relational/sqlite/models';
import { DefaultSqliteRepository } from '@/relational/sqlite/repositories';
import { defineUpsertCases, type IUpsertRow } from './upsert-cases';

/** `upsert` on SQLite (libsql in memory); the cases are shared with PGlite. */
const TABLE_NAME = 'upsert_lite_item';

let tick = 0;

const columns = () => ({
  id: integer('id').primaryKey({ autoIncrement: true }),
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
  deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
});

const itemTable = sqliteTable(TABLE_NAME, columns(), (table) => [
  uniqueIndex('upsert_lite_item_code').on(table.code),
  uniqueIndex('upsert_lite_item_merchant_slug')
    .on(table.merchantId, table.slug)
    .where(sql`${table.deletedAt} is null`),
  index('upsert_lite_item_value').on(table.value),
]);

/** Same column names as `itemTable`, another table: its key must not be accepted by `itemTable`'s repository. */
const twinTable = sqliteTable('upsert_lite_twin', columns(), (table) => [
  uniqueIndex('upsert_lite_twin_code').on(table.code),
]);

let resolver: (context: { operation: TScopeOperation }) => AnyType = () => ({});

const SETTINGS = {
  hiddenProperties: ['secret'],
  query: { filter: { where: { deletedAt: null } } },
};

@model({
  type: 'entity',
  settings: { ...SETTINGS, access: { resolve: (context) => resolver(context) } },
})
class UpsertLiteItem extends BaseSqliteEntity {
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
class UpsertLiteAssignItem extends BaseSqliteEntity {
  static override TABLE_NAME = TABLE_NAME;
  static override schema = itemTable;
}

@datasource({ driver: LibSqlDriver })
class UpsertLiteDataSource extends BaseSqliteDataSource<{ url: string }, AnyType, {}, Client> {
  constructor(opts: { client: Client }) {
    super({
      name: UpsertLiteDataSource.name,
      config: { url: ':memory:' },
      schema: { [TABLE_NAME]: itemTable },
    });

    this.client = opts.client;
  }

  override configure(): ValueOrPromise<void> {}

  endDriver(): Promise<void> {
    return this.resolveDriver().end();
  }
}

let client: Client;
let dataSource: UpsertLiteDataSource;
let items: DefaultSqliteRepository<typeof itemTable>;
let assignItems: DefaultSqliteRepository<typeof itemTable>;

beforeAll(async () => {
  client = createClient({ url: ':memory:' });
  // The database's arbiters come from this DDL, the repository's target from the Drizzle table: both declare the same keys.
  await client.executeMultiple(`
    CREATE TABLE ${TABLE_NAME} (
      id integer primary key autoincrement,
      merchant_id text,
      code text not null,
      slug text,
      name text,
      value text,
      secret text,
      status text not null default 'NEW',
      created_at text,
      modified_at text,
      deleted_at integer
    );
    CREATE UNIQUE INDEX upsert_lite_item_code ON ${TABLE_NAME} (code);
    CREATE UNIQUE INDEX upsert_lite_item_merchant_slug ON ${TABLE_NAME} (merchant_id, slug) WHERE deleted_at IS NULL;
    CREATE INDEX upsert_lite_item_value ON ${TABLE_NAME} (value);
  `);

  dataSource = new UpsertLiteDataSource({ client });
  items = new DefaultSqliteRepository<typeof itemTable>(dataSource as AnyType, {
    entityClass: UpsertLiteItem as AnyType,
  });
  assignItems = new DefaultSqliteRepository<typeof itemTable>(dataSource as AnyType, {
    entityClass: UpsertLiteAssignItem as AnyType,
  });
}, 30_000);

afterAll(async () => {
  await dataSource.endDriver();
});

defineUpsertCases(() => ({
  items,
  assignItems,
  codeKey: UniqueKeys.of({ table: itemTable, index: 'upsert_lite_item_code' }),
  slugKey: UniqueKeys.of({ table: itemTable, index: 'upsert_lite_item_merchant_slug' }),
  foreignKey: UniqueKeys.of({ table: twinTable, index: 'upsert_lite_twin_code' }),
  executor: dataSource.getQueryExecutor(),
  setResolver: (next) => {
    resolver = next;
  },
  reset: async () => {
    await client.executeMultiple(`
      DELETE FROM ${TABLE_NAME};
      DELETE FROM sqlite_sequence WHERE name = '${TABLE_NAME}';
      INSERT INTO ${TABLE_NAME} (merchant_id, code, slug, name, value, secret, status, created_at, modified_at, deleted_at) VALUES
        ('m1', 'A', 'a', 'a', 'v1', 's1', 'OLD', 'seed', 'seed', NULL),
        ('m2', 'B', 'b', 'b', 'v2', 's2', 'OLD', 'seed', 'seed', NULL),
        ('m1', 'C', 'c', 'c', 'v3', 's3', 'OLD', 'seed', 'seed', 1700000000000),
        (NULL, 'S', 's', 's', 'v4', 's4', 'OLD', 'seed', 'seed', NULL);
    `);
  },
  rawRows: async () => {
    const { rows } = await client.execute(`SELECT * FROM ${TABLE_NAME} ORDER BY id`);

    return rows.map((row): IUpsertRow => ({
      id: Number(row.id),
      merchantId: row.merchant_id as string | null,
      code: String(row.code),
      slug: row.slug as string | null,
      name: row.name as string | null,
      value: row.value as string | null,
      secret: row.secret as string | null,
      status: String(row.status),
      createdAt: row.created_at as string | null,
      modifiedAt: row.modified_at as string | null,
      isDeleted: row.deleted_at !== null,
    }));
  },
}));
