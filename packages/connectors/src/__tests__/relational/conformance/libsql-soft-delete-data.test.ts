import type { TScopeResolution } from './scope-resolution';
import { BaseSqliteDataSource } from '@/relational/sqlite/datasources';
import { LibSqlDriver } from '@/relational/sqlite/drivers/libsql';
import { BaseSqliteEntity } from '@/relational/sqlite/models';
import { UniqueKeys } from '@/relational/core/models';
import {
  SoftDeletableRelationalRepository,
  type TSoftDeletableTableSchema,
} from '@/relational/core/repositories/core/soft-deletable';
import {
  DefaultSqliteRepository,
  SoftDeletableSqliteRepository,
} from '@/relational/sqlite/repositories';
import type { Client } from '@libsql/client';
import { createClient } from '@libsql/client';
import {
  datasource,
  model,
  type TScopeOperation,
  type TAnyDataSourceSchema,
} from '@venizia/ignis-kernel';
import { afterAll, beforeAll } from 'bun:test';
import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import {
  defineSoftDeleteDataCases,
  type ISoftDeleteDataInsert,
  type ISoftDeleteDataRecord,
  type ISoftDeleteDataRow,
} from './soft-delete-data-cases';
import type { TSameShape } from './table-shape';

/** `deletedAt` on a real SQLite engine (libsql, in memory); the cases are shared with Postgres. */
const TABLE_NAME = 'soft_delete_data_libsql';

const itemTable = sqliteTable(
  TABLE_NAME,
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    merchantId: text('merchant_id').notNull(),
    code: text('code').notNull(),
    status: text('status').notNull().default('open'),
    deletedAt: integer('removed_at', { mode: 'timestamp_ms' }),
  },
  (table) => [uniqueIndex('soft_delete_data_libsql_code').on(table.code)],
);

/** The cases type rows and data on `ISoftDeleteDataRecord` and `ISoftDeleteDataInsert`; this fails to compile if the table drifts from them. */
export const itemShape: [
  TSameShape<typeof itemTable.$inferSelect, ISoftDeleteDataRecord>,
  TSameShape<typeof itemTable.$inferInsert, ISoftDeleteDataInsert>,
] = [true, true];

let resolver: (context: { operation: TScopeOperation }) => TScopeResolution = () => ({});

@model({
  type: 'entity',
  settings: {
    access: { resolve: (context) => resolver(context) },
    query: { filter: { where: { deletedAt: null } } },
  },
})
class ScopedItem extends BaseSqliteEntity<typeof itemTable> {
  static override TABLE_NAME = TABLE_NAME;
  static override schema = itemTable;
}

@model({ type: 'entity' })
class OpenItem extends BaseSqliteEntity<typeof itemTable> {
  static override TABLE_NAME = TABLE_NAME;
  static override schema = itemTable;
}

@model({ type: 'entity' })
class PlainItem extends BaseSqliteEntity<typeof itemTable> {
  static override TABLE_NAME = TABLE_NAME;
  static override schema = itemTable;
}

@datasource({ driver: LibSqlDriver })
class SoftDeleteDataSource extends BaseSqliteDataSource<
  { url: string },
  TAnyDataSourceSchema,
  {},
  Client
> {
  constructor(opts: { client: Client }) {
    super({
      name: SoftDeleteDataSource.name,
      config: { url: ':memory:' },
      schema: { [TABLE_NAME]: itemTable },
    });

    this.client = opts.client;
  }

  override configure(): void {}
}

const client: Client = createClient({ url: ':memory:' });
const dataSource = new SoftDeleteDataSource({ client });

beforeAll(async () => {
  await client.batch([
    `CREATE TABLE ${TABLE_NAME} (id integer primary key autoincrement, merchant_id text not null, code text not null, status text not null default 'open', removed_at integer)`,
    `CREATE UNIQUE INDEX soft_delete_data_libsql_code ON ${TABLE_NAME} (code)`,
  ]);
});

afterAll(() => {
  client.close();
});

const items = new SoftDeletableRelationalRepository<TSoftDeletableTableSchema>(dataSource, {
  entityClass: ScopedItem,
});
const open = new SoftDeletableSqliteRepository<typeof itemTable>(dataSource, {
  entityClass: OpenItem,
});
const plain = new DefaultSqliteRepository<typeof itemTable>(dataSource, {
  entityClass: PlainItem,
});

defineSoftDeleteDataCases(() => ({
  items,
  plain,
  open,
  deletedAtColumn: 'removed_at',
  codeKey: UniqueKeys.of<TSoftDeletableTableSchema>({
    table: itemTable,
    index: 'soft_delete_data_libsql_code',
  }),
  executor: dataSource.getQueryExecutor(),
  setResolver: (next) => {
    resolver = next;
  },
  reset: async () => {
    await client.batch([
      `DELETE FROM ${TABLE_NAME}`,
      `DELETE FROM sqlite_sequence WHERE name = '${TABLE_NAME}'`,
      `INSERT INTO ${TABLE_NAME} (merchant_id, code, status, removed_at) VALUES ('m1', 'A', 'open', NULL), ('m2', 'B', 'open', NULL), ('m1', 'C', 'open', NULL)`,
    ]);
  },
  rawRows: async () => {
    const { rows } = await client.execute(`SELECT * FROM ${TABLE_NAME} ORDER BY id`);

    return rows.map((row): ISoftDeleteDataRow => ({
      id: Number(row.id),
      merchantId: String(row.merchant_id),
      code: String(row.code),
      status: String(row.status),
      isDeleted: row.removed_at !== null,
    }));
  },
}));
