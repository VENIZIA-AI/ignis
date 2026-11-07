import { BasePostgresDataSource } from '@/relational/postgres/datasources';
import { PGliteDriver } from '@/relational/postgres/drivers/pglite';
import { BasePostgresEntity } from '@/relational/postgres/models';
import { PGliteCRUDRepository } from '@/relational/postgres/repositories';
import { PGlite } from '@electric-sql/pglite';
import type { AnyType } from '@venizia/ignis-helpers/common';
import { datasource, model } from '@venizia/ignis-kernel';
import { afterAll, beforeAll } from 'bun:test';
import { integer, pgTable, primaryKey, serial, text, timestamp } from 'drizzle-orm/pg-core';
import type { IFindEveryHarness } from './find-every-conformance';
import { runFindEveryConformance } from './find-every-conformance';

const ITEMS = 'pglite_find_every_items';
const COMPOSITE = 'pglite_find_every_composite';

const itemsTable = pgTable(ITEMS, {
  id: serial('id').primaryKey(),
  tenant: text('tenant').notNull(),
  name: text('name').notNull(),
  secret: text('secret'),
  deletedAt: timestamp('deleted_at'),
});

const compositeTable = pgTable(
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
class ScopedItem extends BasePostgresEntity<typeof itemsTable> {
  static override TABLE_NAME = ITEMS;
  static override schema = itemsTable;
}

@model({ type: 'entity', settings: { query: { limit: { max: 20_000 } } } })
class OpenItem extends BasePostgresEntity<typeof itemsTable> {
  static override TABLE_NAME = ITEMS;
  static override schema = itemsTable;
}

@model({ type: 'entity', settings: { query: { limit: { max: 3 } } } })
class CappedItem extends BasePostgresEntity<typeof itemsTable> {
  static override TABLE_NAME = ITEMS;
  static override schema = itemsTable;
}

@model({ type: 'entity', settings: { hiddenProperties: ['id'] } })
class HiddenKeyItem extends BasePostgresEntity<typeof itemsTable> {
  static override TABLE_NAME = ITEMS;
  static override schema = itemsTable;
}

@model({ type: 'entity' })
class CompositeItem extends BasePostgresEntity<typeof compositeTable> {
  static override TABLE_NAME = COMPOSITE;
  static override schema = compositeTable;
}

@datasource({ driver: PGliteDriver })
class FindEveryDataSource extends BasePostgresDataSource<{}, AnyType, {}, PGlite> {
  constructor(opts: { client: PGlite }) {
    super({
      name: FindEveryDataSource.name,
      config: {},
      schema: { [ITEMS]: itemsTable, [COMPOSITE]: compositeTable },
    });

    this.client = opts.client;
  }

  override configure(): void {}

  override getConnectionString(): string {
    return 'pglite://memory';
  }
}

const client = new PGlite();
const dataSource = new FindEveryDataSource({ client });

beforeAll(async () => {
  await client.exec(`
    CREATE TABLE ${ITEMS} (id serial primary key, tenant text not null, name text not null, secret text, deleted_at timestamp);
    CREATE TABLE ${COMPOSITE} (id integer not null, tenant text not null, primary key (id, tenant));
  `);
});

afterAll(async () => {
  await client.close();
});

const harness: IFindEveryHarness = {
  scoped: new PGliteCRUDRepository<AnyType>(dataSource, { entityClass: ScopedItem }),
  open: new PGliteCRUDRepository<AnyType>(dataSource, { entityClass: OpenItem }),
  capped: new PGliteCRUDRepository<AnyType>(dataSource, { entityClass: CappedItem }),
  hiddenKey: new PGliteCRUDRepository<AnyType>(dataSource, { entityClass: HiddenKeyItem }),
  composite: new PGliteCRUDRepository<AnyType>(dataSource, { entityClass: CompositeItem }),
  setTenant: (tenant) => {
    currentTenant = tenant;
  },
  reset: async () => {
    await client.exec(`TRUNCATE TABLE ${ITEMS}, ${COMPOSITE};`);
  },
  beginTransaction: () => dataSource.beginTransaction(),
};

runFindEveryConformance({ engine: 'postgres (PGlite)', build: () => harness });
