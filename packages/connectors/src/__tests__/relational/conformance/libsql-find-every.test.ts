import { BaseSqliteDataSource } from '@/relational/sqlite/datasources';
import { LibSqlDriver } from '@/relational/sqlite/drivers/libsql';
import { BaseSqliteEntity } from '@/relational/sqlite/models';
import { DefaultSqliteRepository } from '@/relational/sqlite/repositories';
import type { Client } from '@libsql/client';
import { createClient } from '@libsql/client';
import type { AnyType } from '@venizia/ignis-helpers/common';
import { datasource, model } from '@venizia/ignis-kernel';
import { afterAll, beforeAll } from 'bun:test';
import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { IFindEveryHarness } from './find-every-conformance';
import { runFindEveryConformance } from './find-every-conformance';

const ITEMS = 'libsql_find_every_items';
const COMPOSITE = 'libsql_find_every_composite';

const itemsTable = sqliteTable(ITEMS, {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tenant: text('tenant').notNull(),
  name: text('name').notNull(),
  secret: text('secret'),
  deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
});

const compositeTable = sqliteTable(
  COMPOSITE,
  { id: integer('id').notNull(), tenant: text('tenant').notNull() },
  (table) => [primaryKey({ columns: [table.id, table.tenant] })],
);

let currentTenant = 'a';

@model({
  type: 'entity',
  settings: {
    hiddenProperties: ['secret'],
    access: { resolve: () => ({ tenant: currentTenant }) },
    query: { filter: { where: { deletedAt: null } } },
  },
})
class ScopedItem extends BaseSqliteEntity<typeof itemsTable> {
  static override TABLE_NAME = ITEMS;
  static override schema = itemsTable;
}

@model({ type: 'entity', settings: { query: { limit: { max: 20_000 } } } })
class OpenItem extends BaseSqliteEntity<typeof itemsTable> {
  static override TABLE_NAME = ITEMS;
  static override schema = itemsTable;
}

@model({ type: 'entity', settings: { query: { limit: { max: 3 } } } })
class CappedItem extends BaseSqliteEntity<typeof itemsTable> {
  static override TABLE_NAME = ITEMS;
  static override schema = itemsTable;
}

@model({ type: 'entity', settings: { hiddenProperties: ['id'] } })
class HiddenKeyItem extends BaseSqliteEntity<typeof itemsTable> {
  static override TABLE_NAME = ITEMS;
  static override schema = itemsTable;
}

@model({ type: 'entity' })
class CompositeItem extends BaseSqliteEntity<typeof compositeTable> {
  static override TABLE_NAME = COMPOSITE;
  static override schema = compositeTable;
}

@datasource({ driver: LibSqlDriver })
class FindEveryDataSource extends BaseSqliteDataSource<{ url: string }, AnyType, {}, Client> {
  constructor(opts: { client: Client }) {
    super({
      name: FindEveryDataSource.name,
      config: { url: ':memory:' },
      schema: { [ITEMS]: itemsTable, [COMPOSITE]: compositeTable },
    });

    this.client = opts.client;
  }

  override configure(): void {}
}

const client: Client = createClient({ url: ':memory:' });
const dataSource = new FindEveryDataSource({ client });

beforeAll(async () => {
  await client.batch([
    `CREATE TABLE ${ITEMS} (id integer primary key autoincrement, tenant text not null, name text not null, secret text, deleted_at integer)`,
    `CREATE TABLE ${COMPOSITE} (id integer not null, tenant text not null, primary key (id, tenant))`,
  ]);
});

afterAll(() => {
  client.close();
});

const harness: IFindEveryHarness = {
  scoped: new DefaultSqliteRepository<AnyType>(dataSource, { entityClass: ScopedItem }),
  open: new DefaultSqliteRepository<AnyType>(dataSource, { entityClass: OpenItem }),
  capped: new DefaultSqliteRepository<AnyType>(dataSource, { entityClass: CappedItem }),
  hiddenKey: new DefaultSqliteRepository<AnyType>(dataSource, { entityClass: HiddenKeyItem }),
  composite: new DefaultSqliteRepository<AnyType>(dataSource, { entityClass: CompositeItem }),
  setTenant: (tenant) => {
    currentTenant = tenant;
  },
  reset: async () => {
    await client.batch([`DELETE FROM ${ITEMS}`, `DELETE FROM ${COMPOSITE}`]);
  },
  beginTransaction: () => dataSource.beginTransaction(),
};

runFindEveryConformance({ engine: 'sqlite (libsql :memory:)', build: () => harness });
