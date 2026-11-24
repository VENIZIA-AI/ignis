import type { TScopeResolution } from './scope-resolution';
import type { Client } from '@libsql/client';
import { createClient } from '@libsql/client';
import type { ValueOrPromise } from '@venizia/ignis-helpers/common';
import { datasource, model, type TAnyDataSourceSchema } from '@venizia/ignis-kernel';
import { afterAll, beforeAll } from 'bun:test';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { BaseSqliteDataSource } from '@/relational/sqlite/datasources';
import { LibSqlDriver } from '@/relational/sqlite/drivers/libsql';
import { BaseSqliteEntity } from '@/relational/sqlite/models';
import { DefaultSqliteRepository } from '@/relational/sqlite/repositories';
import {
  defineScopeWriteJsonCases,
  type IJsonRow,
  type IJsonScopeContext,
  type TJsonScopeMode,
} from './scope-write-json-cases';

/** The write side of an access scope on a JSON member, on SQLite (libsql); the cases are shared with PGlite. */
const TABLE_NAME = 'lite_json_scope_items';

const itemsTable = sqliteTable(TABLE_NAME, {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  meta: text('meta', { mode: 'json' }),
});

let scope: TScopeResolution = {};
const resolve = () => scope;

@model({ type: 'entity', settings: { access: { resolve } } })
class RejectItem extends BaseSqliteEntity<typeof itemsTable> {
  static override TABLE_NAME = TABLE_NAME;
  static override schema = itemsTable;
}

@model({ type: 'entity', settings: { access: { resolve, write: { mode: 'assign' } } } })
class AssignItem extends BaseSqliteEntity<typeof itemsTable> {
  static override TABLE_NAME = TABLE_NAME;
  static override schema = itemsTable;
}

@model({ type: 'entity', settings: { access: { resolve, write: { sharedRows: true } } } })
class SharedItem extends BaseSqliteEntity<typeof itemsTable> {
  static override TABLE_NAME = TABLE_NAME;
  static override schema = itemsTable;
}

@datasource({ driver: LibSqlDriver })
class JsonScopeSqliteDataSource extends BaseSqliteDataSource<
  { url: string },
  TAnyDataSourceSchema,
  {},
  Client
> {
  constructor(opts: { client: Client }) {
    super({
      name: JsonScopeSqliteDataSource.name,
      config: { url: ':memory:' },
      schema: { [TABLE_NAME]: itemsTable },
    });

    this.client = opts.client;
  }

  override configure(): ValueOrPromise<void> {}
}

let client: Client;
let dataSource: JsonScopeSqliteDataSource;

const repositoryOf = (opts: { mode: TJsonScopeMode }) => {
  switch (opts.mode) {
    case 'assign': {
      return new DefaultSqliteRepository<typeof itemsTable>(dataSource, {
        entityClass: AssignItem,
      });
    }
    case 'shared': {
      return new DefaultSqliteRepository<typeof itemsTable>(dataSource, {
        entityClass: SharedItem,
      });
    }
    default: {
      return new DefaultSqliteRepository<typeof itemsTable>(dataSource, {
        entityClass: RejectItem,
      });
    }
  }
};

beforeAll(async () => {
  client = createClient({ url: ':memory:' });
  await client.execute(
    `CREATE TABLE ${TABLE_NAME} (id integer primary key autoincrement, name text not null, meta text)`,
  );
  dataSource = new JsonScopeSqliteDataSource({ client });
});

afterAll(() => {
  client.close();
});

const isMeta = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const parseMeta = (value: unknown): IJsonRow['meta'] => {
  if (typeof value !== 'string') {
    return null;
  }

  const parsed: unknown = JSON.parse(value);

  return isMeta(parsed) ? parsed : null;
};

const context: IJsonScopeContext = {
  setScope: (opts) => {
    scope = opts.scope;
  },
  reset: async () => {
    await client.executeMultiple(`DELETE FROM ${TABLE_NAME}; DELETE FROM sqlite_sequence;`);
  },
  seed: async (opts) => {
    for (const row of opts.rows) {
      await client.execute({
        sql: `INSERT INTO ${TABLE_NAME} (name, meta) VALUES (?, ?)`,
        args: [row.name, row.meta === null ? null : JSON.stringify(row.meta)],
      });
    }
  },
  rows: async () => {
    const { rows } = await client.execute(`SELECT name, meta FROM ${TABLE_NAME} ORDER BY id`);

    return rows.map((row): IJsonRow => ({ name: String(row.name), meta: parseMeta(row.meta) }));
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

defineScopeWriteJsonCases({ engine: 'libsql', context: () => context });
