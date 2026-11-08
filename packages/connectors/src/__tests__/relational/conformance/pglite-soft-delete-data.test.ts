import { BasePostgresDataSource } from '@/relational/postgres/datasources';
import { PGliteDriver } from '@/relational/postgres/drivers/pglite';
import { BasePostgresEntity } from '@/relational/postgres/models';
import { PGliteCRUDRepository } from '@/relational/postgres/repositories';
import { UniqueKeys } from '@/relational/core/models';
import { SoftDeletableRelationalRepository } from '@/relational/core/repositories/core/soft-deletable';
import { PGlite } from '@electric-sql/pglite';
import type { AnyType } from '@venizia/ignis-helpers/common';
import { datasource, model, type TScopeOperation } from '@venizia/ignis-kernel';
import { afterAll, beforeAll } from 'bun:test';
import { pgTable, serial, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import type { ISoftDeleteDataRow } from './soft-delete-data-cases';
import { defineSoftDeleteDataCases } from './soft-delete-data-cases';

/** `deletedAt` on a real Postgres engine (PGlite); the cases are shared with libsql. */
const TABLE_NAME = 'soft_delete_data_pg';

const itemTable = pgTable(
  TABLE_NAME,
  {
    id: serial('id').primaryKey(),
    merchantId: text('merchant_id').notNull(),
    code: text('code').notNull(),
    status: text('status').notNull().default('open'),
    deletedAt: timestamp('deleted_at'),
  },
  (table) => [uniqueIndex('soft_delete_data_pg_code').on(table.code)],
);

let resolver: (context: { operation: TScopeOperation }) => AnyType = () => ({});

@model({
  type: 'entity',
  settings: {
    access: { resolve: (context) => resolver(context) },
    query: { filter: { where: { deletedAt: null } } },
  },
})
class ScopedItem extends BasePostgresEntity<typeof itemTable> {
  static override TABLE_NAME = TABLE_NAME;
  static override schema = itemTable;
}

@model({ type: 'entity' })
class OpenItem extends BasePostgresEntity<typeof itemTable> {
  static override TABLE_NAME = TABLE_NAME;
  static override schema = itemTable;
}

@model({ type: 'entity' })
class PlainItem extends BasePostgresEntity<typeof itemTable> {
  static override TABLE_NAME = TABLE_NAME;
  static override schema = itemTable;
}

@datasource({ driver: PGliteDriver })
class SoftDeleteDataSource extends BasePostgresDataSource<{}, AnyType, {}, PGlite> {
  constructor(opts: { client: PGlite }) {
    super({ name: SoftDeleteDataSource.name, config: {}, schema: { [TABLE_NAME]: itemTable } });

    this.client = opts.client;
  }

  override configure(): void {}

  override getConnectionString(): string {
    return 'pglite://memory';
  }
}

const client = new PGlite();
const dataSource = new SoftDeleteDataSource({ client });

beforeAll(async () => {
  await client.exec(`
    CREATE TABLE ${TABLE_NAME} (
      id serial primary key,
      merchant_id text not null,
      code text not null,
      status text not null default 'open',
      deleted_at timestamp
    );
    CREATE UNIQUE INDEX soft_delete_data_pg_code ON ${TABLE_NAME} (code);
  `);
}, 30_000);

afterAll(async () => {
  await client.close();
});

const items = new SoftDeletableRelationalRepository<AnyType>(dataSource, {
  entityClass: ScopedItem,
});
const open = new SoftDeletableRelationalRepository<AnyType>(dataSource, { entityClass: OpenItem });
const plain = new PGliteCRUDRepository<AnyType>(dataSource, { entityClass: PlainItem });

defineSoftDeleteDataCases(() => ({
  items,
  plain,
  open,
  codeKey: UniqueKeys.of({ table: itemTable, index: 'soft_delete_data_pg_code' }),
  executor: dataSource.getQueryExecutor(),
  setResolver: (next) => {
    resolver = next;
  },
  reset: async () => {
    await client.exec(`TRUNCATE TABLE ${TABLE_NAME} RESTART IDENTITY;`);
    await client.exec(`
      INSERT INTO ${TABLE_NAME} (merchant_id, code, status, deleted_at) VALUES
        ('m1', 'A', 'open', NULL),
        ('m2', 'B', 'open', NULL),
        ('m1', 'C', 'open', NULL);
    `);
  },
  rawRows: async () => {
    const { rows } = await client.query<AnyType>(`SELECT * FROM ${TABLE_NAME} ORDER BY id`);

    return rows.map((row): ISoftDeleteDataRow => ({
      id: Number(row.id),
      merchantId: row.merchant_id,
      code: row.code,
      status: row.status,
      isDeleted: row.deleted_at !== null,
    }));
  },
}));
