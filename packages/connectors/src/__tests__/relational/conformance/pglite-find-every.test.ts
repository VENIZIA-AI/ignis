import type { IRelationalTransaction } from '@/relational/core/datasources/common';
import { BasePostgresDataSource } from '@/relational/postgres/datasources';
import { PGliteDriver } from '@/relational/postgres/drivers/pglite';
import { BasePostgresEntity } from '@/relational/postgres/models';
import { DefaultCRUDRepository } from '@/relational/postgres/repositories';
import { PGlite } from '@electric-sql/pglite';
import type { AnyType, ValueOrPromise } from '@venizia/ignis-helpers/common';
import { datasource, model } from '@venizia/ignis-kernel';
import { afterAll, beforeAll } from 'bun:test';
import { integer, pgTable, primaryKey, serial, text, timestamp } from 'drizzle-orm/pg-core';
import type { IFindEveryHarness } from './find-every-conformance';
import { runFindEveryConformance } from './find-every-conformance';

/** One table name per table: the model registry is keyed by it for the whole process. */
const ITEMS = 'pglite_find_every_items';
const TEXTS = 'pglite_find_every_texts';
const COMPOSITE = 'pglite_find_every_composite';

const itemsTable = pgTable(ITEMS, {
  id: serial('id').primaryKey(),
  tenant: text('tenant').notNull(),
  name: text('name').notNull(),
  secret: text('secret'),
  deletedAt: timestamp('deleted_at'),
});

const textsTable = pgTable(TEXTS, {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
});

const compositeTable = pgTable(
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
class ScopedItem extends BasePostgresEntity {
  static override TABLE_NAME = ITEMS;
  static override schema = itemsTable;
}

@model({ type: 'entity' })
class OpenItem extends BasePostgresEntity {
  static override TABLE_NAME = ITEMS;
  static override schema = itemsTable;
}

@model({ type: 'entity', settings: { query: { limit: { max: 3 } } } })
class CappedItem extends BasePostgresEntity {
  static override TABLE_NAME = ITEMS;
  static override schema = itemsTable;
}

@model({ type: 'entity', settings: { hiddenProperties: ['id'] } })
class HiddenKeyItem extends BasePostgresEntity {
  static override TABLE_NAME = ITEMS;
  static override schema = itemsTable;
}

@model({ type: 'entity' })
class TextItem extends BasePostgresEntity {
  static override TABLE_NAME = TEXTS;
  static override schema = textsTable;
}

@model({ type: 'entity' })
class CompositeItem extends BasePostgresEntity {
  static override TABLE_NAME = COMPOSITE;
  static override schema = compositeTable;
}

@datasource({ driver: PGliteDriver })
class FindEveryDataSource extends BasePostgresDataSource<{}, AnyType, {}, PGlite> {
  constructor(opts: { client: PGlite }) {
    super({
      name: FindEveryDataSource.name,
      config: {},
      schema: { [ITEMS]: itemsTable, [TEXTS]: textsTable, [COMPOSITE]: compositeTable },
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
let dataSource: FindEveryDataSource;
let harness: IFindEveryHarness;

beforeAll(async () => {
  client = new PGlite();
  await client.waitReady;

  await client.exec(`
    CREATE TABLE ${ITEMS} (
      id serial primary key,
      tenant text not null,
      name text not null,
      secret text,
      deleted_at timestamp
    );
    CREATE TABLE ${TEXTS} (id text primary key, name text not null);
    CREATE TABLE ${COMPOSITE} (
      id integer not null,
      tenant text not null,
      name text not null,
      primary key (id, tenant)
    );
  `);

  dataSource = new FindEveryDataSource({ client });

  const build = (entityClass: AnyType) =>
    new DefaultCRUDRepository<AnyType>(dataSource as AnyType, { entityClass }) as AnyType;

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
      await client.exec(`TRUNCATE TABLE ${ITEMS}, ${TEXTS}, ${COMPOSITE};`);
    },
    beginTransaction: (): Promise<IRelationalTransaction<AnyType>> => dataSource.beginTransaction(),
  };
});

afterAll(async () => {
  await dataSource.endDriver();
});

runFindEveryConformance({ engine: 'postgres (PGlite)', build: () => harness });
