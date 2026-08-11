import type { IRelationalTransaction } from '@/connectors/relational/datasources/common';
import { datasource, model } from '@/base/metadata';
import { BaseSqliteDataSource } from '@/connectors/sqlite/datasources';
import { LibSqlDriver } from '@/connectors/sqlite/drivers/libsql';
import { BaseSqliteEntity } from '@/connectors/sqlite/models';
import { DefaultSqliteRepository } from '@/connectors/sqlite/repositories';
import type { Client } from '@libsql/client';
import { createClient } from '@libsql/client';
import type { AnyType, ValueOrPromise } from '@venizia/ignis-helpers';
import { afterAll, beforeAll } from 'bun:test';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { IConformanceHarness, TConformanceRepository } from './repository-conformance';
import { runRepositoryConformance } from './repository-conformance';

/**
 * The model registry is a process-wide singleton keyed by table name, so a name shared with the
 * sibling engine suite would silently swap one engine's schema for the other's.
 */
const TABLE_NAME = 'libsql_conformance';

/**
 * `tags` is a JSON-mode `text` where Postgres declares `text[]`: SQLite has no array storage class.
 */
const conformanceTable = sqliteTable(TABLE_NAME, {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  tenant: text('tenant').notNull(),
  score: integer('score'),
  secret: text('secret'),
  tags: text('tags', { mode: 'json' }).$type<string[]>(),
});

@model({ type: 'entity', settings: { hiddenProperties: ['secret'] } })
class ConformanceEntity extends BaseSqliteEntity {
  static override TABLE_NAME = TABLE_NAME;
  static override schema = conformanceTable;
}

@model({
  type: 'entity',
  settings: { hiddenProperties: ['secret'], defaultFilter: { where: { tenant: 'acme' } } },
})
class ScopedConformanceEntity extends BaseSqliteEntity {
  static override TABLE_NAME = TABLE_NAME;
  static override schema = conformanceTable;
}

@datasource({ driver: LibSqlDriver })
class ConformanceSqliteDataSource extends BaseSqliteDataSource<
  { url: string },
  AnyType,
  {},
  Client
> {
  constructor(opts: { client: Client }) {
    super({
      name: ConformanceSqliteDataSource.name,
      config: { url: ':memory:' },
      schema: { [ConformanceEntity.TABLE_NAME]: conformanceTable },
    });

    this.client = opts.client;
  }

  override configure(): ValueOrPromise<void> {}
}

/** ONE `:memory:` libsql database for the whole suite; every test re-seeds the single table. */
let client: Client;
let harness: IConformanceHarness;

beforeAll(async () => {
  client = createClient({ url: ':memory:' });

  await client.execute(`
    CREATE TABLE ${TABLE_NAME} (
      id integer primary key autoincrement,
      name text not null,
      tenant text not null,
      score integer,
      secret text,
      tags text
    )
  `);

  const dataSource = new ConformanceSqliteDataSource({ client });

  harness = {
    repository: new DefaultSqliteRepository<AnyType>(dataSource as AnyType, {
      entityClass: ConformanceEntity,
    }) as TConformanceRepository,
    scopedRepository: new DefaultSqliteRepository<AnyType>(dataSource as AnyType, {
      entityClass: ScopedConformanceEntity,
    }) as TConformanceRepository,
    beginTransaction: (): Promise<IRelationalTransaction<AnyType>> => dataSource.beginTransaction(),
  };
});

afterAll(() => {
  client.close();
});

runRepositoryConformance({
  engine: 'sqlite (libsql :memory:)',
  capabilities: {
    rowLocking: false,
    regexp: false,
    arrayOperators: false,
    caseInsensitiveLike: true,
    nullsSortHigh: false,
  },
  build: () => harness,
});
