import type { TScopeResolution } from './scope-resolution';
import { PGlite } from '@electric-sql/pglite';
import type { ValueOrPromise } from '@venizia/ignis-helpers/common';
import { datasource, model, type TAnyDataSourceSchema } from '@venizia/ignis-kernel';
import { afterAll, beforeAll } from 'bun:test';
import { jsonb, pgTable, serial, text } from 'drizzle-orm/pg-core';
import { BasePostgresDataSource } from '@/relational/postgres/datasources';
import { PGliteDriver } from '@/relational/postgres/drivers/pglite';
import { ModelFactory } from '@/relational/postgres/models';
import { PGliteDefaultRepository } from './pglite-repositories';
import {
  defineScopeWriteJsonCases,
  type IJsonRow,
  type IJsonScopeContext,
  type TJsonScopeMode,
} from './scope-write-json-cases';

/** The write side of an access scope on a JSON member, on PGlite; the cases are shared with libsql. */
const TABLE_NAME = 'json_scope_items';

const itemsTable = pgTable(TABLE_NAME, {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  meta: jsonb('meta'),
});

let scope: TScopeResolution = {};
const resolve = () => scope;

const ItemBase = ModelFactory.defineEntity({ table: itemsTable });

@model({ type: 'entity', settings: { access: { resolve } } })
class RejectItem extends ItemBase {}

@model({ type: 'entity', settings: { access: { resolve, write: { mode: 'assign' } } } })
class AssignItem extends ItemBase {}

@model({ type: 'entity', settings: { access: { resolve, write: { sharedRows: true } } } })
class SharedItem extends ItemBase {}

@datasource({ driver: PGliteDriver })
class JsonScopeDataSource extends BasePostgresDataSource<{}, TAnyDataSourceSchema, {}, PGlite> {
  constructor(opts: { client: PGlite }) {
    super({
      name: JsonScopeDataSource.name,
      config: {},
      schema: { [TABLE_NAME]: itemsTable },
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
let dataSource: JsonScopeDataSource;

const repositoryOf = (opts: { mode: TJsonScopeMode }) => {
  switch (opts.mode) {
    case 'assign': {
      return new PGliteDefaultRepository<typeof itemsTable>(dataSource, {
        entityClass: AssignItem,
      });
    }
    case 'shared': {
      return new PGliteDefaultRepository<typeof itemsTable>(dataSource, {
        entityClass: SharedItem,
      });
    }
    default: {
      return new PGliteDefaultRepository<typeof itemsTable>(dataSource, {
        entityClass: RejectItem,
      });
    }
  }
};

beforeAll(async () => {
  client = new PGlite();
  await client.waitReady;
  await client.exec(
    `CREATE TABLE ${TABLE_NAME} (id serial primary key, name text not null, meta jsonb)`,
  );
  dataSource = new JsonScopeDataSource({ client });
});

afterAll(async () => {
  await dataSource.endDriver();
});

const isMeta = (value: unknown): value is Record<string, unknown> | null => {
  return value === null || (typeof value === 'object' && !Array.isArray(value));
};

const context: IJsonScopeContext = {
  setScope: (opts) => {
    scope = opts.scope;
  },
  reset: async () => {
    await client.exec(`TRUNCATE ${TABLE_NAME} RESTART IDENTITY`);
  },
  seed: async (opts) => {
    for (const row of opts.rows) {
      await client.query(`INSERT INTO ${TABLE_NAME} (name, meta) VALUES ($1, $2::jsonb)`, [
        row.name,
        row.meta === null ? null : JSON.stringify(row.meta),
      ]);
    }
  },
  rows: async () => {
    const { rows } = await client.query<{ name: string; meta: unknown }>(
      `SELECT name, meta FROM ${TABLE_NAME} ORDER BY id`,
    );

    return rows.map((row): IJsonRow => ({
      name: row.name,
      meta: isMeta(row.meta) ? row.meta : null,
    }));
  },
  names: async (opts) => {
    const found = await repositoryOf(opts).find({ filter: { order: ['id asc'] } });

    return found.map((row) => row.name);
  },
  count: async (opts) => {
    const { count } = await repositoryOf(opts).count({ where: {} });

    return count;
  },
  create: (opts) => repositoryOf(opts).create({ data: opts.data }),
  update: (opts) =>
    repositoryOf(opts).updateBy({
      where: opts.where,
      data: opts.data,
      options: { force: opts.force },
    }),
  remove: (opts) =>
    repositoryOf(opts).deleteBy({ where: opts.where, options: { force: opts.force } }),
};

defineScopeWriteJsonCases({ engine: 'PGlite', context: () => context });
