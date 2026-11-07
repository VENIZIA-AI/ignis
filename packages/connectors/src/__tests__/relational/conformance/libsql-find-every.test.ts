import type { IRelationalTransaction } from '@/relational/core/datasources/common';
import { BaseSqliteDataSource } from '@/relational/sqlite/datasources';
import { LibSqlDriver } from '@/relational/sqlite/drivers/libsql';
import { BaseSqliteEntity } from '@/relational/sqlite/models';
import { DefaultSqliteRepository } from '@/relational/sqlite/repositories';
import type { Client } from '@libsql/client';
import { createClient } from '@libsql/client';
import type { AnyType, ValueOrPromise } from '@venizia/ignis-helpers/common';
import { datasource, model } from '@venizia/ignis-kernel';
import { afterAll, beforeAll } from 'bun:test';
import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { IFindEveryHarness } from './find-every-conformance';
import { runFindEveryConformance } from './find-every-conformance';

/** One table name per table: the model registry is keyed by it for the whole process. */
const ITEMS = 'libsql_find_every_items';
const TEXTS = 'libsql_find_every_texts';
const COMPOSITE = 'libsql_find_every_composite';

const itemsTable = sqliteTable(ITEMS, {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tenant: text('tenant').notNull(),
  name: text('name').notNull(),
  secret: text('secret'),
  deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
});

const textsTable = sqliteTable(TEXTS, {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
});

const compositeTable = sqliteTable(
  COMPOSITE,
  {
    id: integer('id').notNull(),
    tenant: text('tenant').notNull(),
    name: text('name').notNull(),
  },
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
class ScopedItem extends BaseSqliteEntity {
  static override TABLE_NAME = ITEMS;
  static override schema = itemsTable;
}

@model({ type: 'entity' })
class OpenItem extends BaseSqliteEntity {
  static override TABLE_NAME = ITEMS;
  static override schema = itemsTable;
}

@model({ type: 'entity', settings: { query: { limit: { max: 3 } } } })
class CappedItem extends BaseSqliteEntity {
  static override TABLE_NAME = ITEMS;
  static override schema = itemsTable;
}

@model({ type: 'entity', settings: { hiddenProperties: ['id'] } })
class HiddenKeyItem extends BaseSqliteEntity {
  static override TABLE_NAME = ITEMS;
  static override schema = itemsTable;
}

@model({ type: 'entity' })
class TextItem extends BaseSqliteEntity {
  static override TABLE_NAME = TEXTS;
  static override schema = textsTable;
}

@model({ type: 'entity' })
class CompositeItem extends BaseSqliteEntity {
  static override TABLE_NAME = COMPOSITE;
  static override schema = compositeTable;
}

@datasource({ driver: LibSqlDriver })
class FindEveryDataSource extends BaseSqliteDataSource<{ url: string }, AnyType, {}, Client> {
  constructor(opts: { client: Client }) {
    super({
      name: FindEveryDataSource.name,
      config: { url: ':memory:' },
      schema: { [ITEMS]: itemsTable, [TEXTS]: textsTable, [COMPOSITE]: compositeTable },
    });

    this.client = opts.client;
  }

  override configure(): ValueOrPromise<void> {}
}

let client: Client;
let harness: IFindEveryHarness;

beforeAll(async () => {
  client = createClient({ url: ':memory:' });

  await client.batch([
    `CREATE TABLE ${ITEMS} (
      id integer primary key autoincrement,
      tenant text not null,
      name text not null,
      secret text,
      deleted_at integer
    )`,
    `CREATE TABLE ${TEXTS} (id text primary key, name text not null)`,
    `CREATE TABLE ${COMPOSITE} (
      id integer not null,
      tenant text not null,
      name text not null,
      primary key (id, tenant)
    )`,
  ]);

  const dataSource = new FindEveryDataSource({ client });

  const build = (entityClass: AnyType) =>
    new DefaultSqliteRepository<AnyType>(dataSource as AnyType, { entityClass }) as AnyType;

  harness = {
    scoped: build(ScopedItem),
    open: build(OpenItem),
    capped: build(CappedItem),
    hiddenKey: build(HiddenKeyItem),
    texts: build(TextItem),
    composite: build(CompositeItem),
    setTenant: (tenant) => {
      currentTenant = tenant;
    },
    reset: async () => {
      await client.batch([
        `DELETE FROM ${ITEMS}`,
        `DELETE FROM ${TEXTS}`,
        `DELETE FROM ${COMPOSITE}`,
      ]);
    },
    beginTransaction: (): Promise<IRelationalTransaction<AnyType>> => dataSource.beginTransaction(),
  };
});

afterAll(() => {
  client.close();
});

runFindEveryConformance({ engine: 'sqlite (libsql :memory:)', build: () => harness });
