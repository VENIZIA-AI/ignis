import { PGlite } from '@electric-sql/pglite';
import type { AnyType, ValueOrPromise } from '@venizia/ignis-helpers/common';
import { datasource, model } from '@venizia/ignis-kernel';
import { afterAll, beforeAll } from 'bun:test';
import { sql } from 'drizzle-orm';
import { pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';
import { BasePostgresDataSource } from '@/relational/postgres/datasources';
import { PGliteDriver } from '@/relational/postgres/drivers/pglite';
import { BasePostgresEntity } from '@/relational/postgres/models';
import { DefaultCRUDRepository, SoftDeletableRepository } from '@/relational/postgres/repositories';
import { SoftDeleteUpdateCases } from './soft-delete-update-cases';

/** An update that sets `deletedAt`, on a real Postgres engine (PGlite); the cases are shared with libsql. */
const TABLE_NAME = 'soft_delete_update_pg';

const itemTable = pgTable(TABLE_NAME, {
  id: serial('id').primaryKey(),
  merchantId: text('merchant_id').notNull(),
  name: text('name').notNull(),
  deletedAt: timestamp('deleted_at'),
});

@model({
  type: 'entity',
  settings: {
    access: { resolve: (context) => SoftDeleteUpdateCases.resolve(context) },
    query: { filter: { where: { deletedAt: null } } },
  },
})
class SoftDeleteUpdateItem extends BasePostgresEntity {
  static override TABLE_NAME = TABLE_NAME;
  static override schema = itemTable;
}

@datasource({ driver: PGliteDriver })
class SoftDeleteUpdateDataSource extends BasePostgresDataSource<{}, AnyType, {}, PGlite> {
  constructor(opts: { client: PGlite }) {
    super({
      name: SoftDeleteUpdateDataSource.name,
      config: {},
      schema: { [TABLE_NAME]: itemTable },
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
let dataSource: SoftDeleteUpdateDataSource;
let soft: AnyType;
let plain: AnyType;

beforeAll(async () => {
  client = new PGlite();
  await client.waitReady;
  await client.exec(`
    CREATE TABLE ${TABLE_NAME} (
      id serial primary key,
      merchant_id text not null,
      name text not null,
      deleted_at timestamp
    );
  `);

  dataSource = new SoftDeleteUpdateDataSource({ client });

  const ds: AnyType = dataSource;
  const entityClass: AnyType = SoftDeleteUpdateItem;

  soft = new SoftDeletableRepository<typeof itemTable>(ds, { entityClass });
  plain = new DefaultCRUDRepository<typeof itemTable>(ds, { entityClass });
}, 30_000);

afterAll(async () => {
  await dataSource.endDriver();
});

SoftDeleteUpdateCases.define(() => ({
  soft,
  plain,
  now: sql`now()`,
  reset: async () => {
    await client.exec(`TRUNCATE TABLE ${TABLE_NAME} RESTART IDENTITY;`);
    await client.exec(`
      INSERT INTO ${TABLE_NAME} (merchant_id, name, deleted_at) VALUES
        ('m1', 'a', NULL), ('m2', 'b', NULL), ('m1', 'c', NULL), ('m1', 'd', now());
    `);
  },
  rawRows: async () => {
    const { rows } = await client.query<{
      id: number;
      merchantId: string;
      name: string;
      isDeleted: boolean;
    }>(
      `SELECT id, merchant_id AS "merchantId", name, deleted_at IS NOT NULL AS "isDeleted" FROM ${TABLE_NAME} ORDER BY id`,
    );

    return rows;
  },
}));
