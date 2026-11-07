import type { Client } from '@libsql/client';
import { createClient } from '@libsql/client';
import type { AnyType, ValueOrPromise } from '@venizia/ignis-helpers/common';
import { datasource, model } from '@venizia/ignis-kernel';
import { afterAll, beforeAll } from 'bun:test';
import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { BaseSqliteDataSource } from '@/relational/sqlite/datasources';
import { LibSqlDriver } from '@/relational/sqlite/drivers/libsql';
import { BaseSqliteEntity } from '@/relational/sqlite/models';
import {
  DefaultSqliteRepository,
  SoftDeletableSqliteRepository,
} from '@/relational/sqlite/repositories';
import { SoftDeleteUpdateCases } from './soft-delete-update-cases';

/** An update that sets `deletedAt`, on SQLite (libsql); the cases are shared with Postgres. */
const TABLE_NAME = 'soft_delete_update_lite';

const itemTable = sqliteTable(TABLE_NAME, {
  id: integer('id').primaryKey({ autoIncrement: true }),
  merchantId: text('merchant_id').notNull(),
  name: text('name').notNull(),
  deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
});

@model({
  type: 'entity',
  settings: {
    access: { resolve: (context) => SoftDeleteUpdateCases.resolve(context) },
    query: { filter: { where: { deletedAt: null } } },
  },
})
class SoftDeleteUpdateLiteItem extends BaseSqliteEntity {
  static override TABLE_NAME = TABLE_NAME;
  static override schema = itemTable;
}

@datasource({ driver: LibSqlDriver })
class SoftDeleteUpdateLiteDataSource extends BaseSqliteDataSource<
  { url: string },
  AnyType,
  {},
  Client
> {
  constructor(opts: { client: Client }) {
    super({
      name: SoftDeleteUpdateLiteDataSource.name,
      config: { url: ':memory:' },
      schema: { [TABLE_NAME]: itemTable },
    });

    this.client = opts.client;
  }

  override configure(): ValueOrPromise<void> {}
}

let client: Client;
let soft: AnyType;
let plain: AnyType;

beforeAll(async () => {
  client = createClient({ url: ':memory:' });
  await client.execute(
    `CREATE TABLE ${TABLE_NAME} (id integer primary key autoincrement, merchant_id text not null, name text not null, deleted_at integer)`,
  );

  const ds: AnyType = new SoftDeleteUpdateLiteDataSource({ client });
  const entityClass: AnyType = SoftDeleteUpdateLiteItem;

  soft = new SoftDeletableSqliteRepository<typeof itemTable>(ds, { entityClass });
  plain = new DefaultSqliteRepository<typeof itemTable>(ds, { entityClass });
});

afterAll(() => {
  client.close();
});

SoftDeleteUpdateCases.define(() => ({
  soft,
  plain,
  now: sql`(unixepoch() * 1000)`,
  reset: async () => {
    await client.executeMultiple(
      `DELETE FROM ${TABLE_NAME}; DELETE FROM sqlite_sequence WHERE name = '${TABLE_NAME}';
       INSERT INTO ${TABLE_NAME} (merchant_id, name, deleted_at) VALUES
         ('m1', 'a', NULL), ('m2', 'b', NULL), ('m1', 'c', NULL), ('m1', 'd', 1700000000000);`,
    );
  },
  rawRows: async () => {
    const { rows } = await client.execute(
      `SELECT id, merchant_id AS merchantId, name, deleted_at IS NOT NULL AS isDeleted FROM ${TABLE_NAME} ORDER BY id`,
    );

    return rows.map((row) => ({
      id: Number(row.id),
      merchantId: String(row.merchantId),
      name: String(row.name),
      isDeleted: Number(row.isDeleted) === 1,
    }));
  },
}));
