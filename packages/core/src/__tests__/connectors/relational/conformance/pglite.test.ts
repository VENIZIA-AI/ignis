import type { IRelationalTransaction } from '@/connectors/relational/datasources/common';
import { datasource, model } from '@/base/metadata';
import { BasePostgresDataSource } from '@/connectors/postgres/datasources';
import { PGliteDriver } from '@/connectors/postgres/drivers/pglite';
import { BasePostgresEntity } from '@/connectors/postgres/models';
import { DefaultCRUDRepository } from '@/connectors/postgres/repositories';
import { PGlite } from '@electric-sql/pglite';
import type { AnyType, ValueOrPromise } from '@venizia/ignis-helpers';
import { afterAll, beforeAll } from 'bun:test';
import { integer, pgTable, serial, text } from 'drizzle-orm/pg-core';
import type { IConformanceHarness, TConformanceRepository } from './repository-conformance';
import { runRepositoryConformance } from './repository-conformance';

/**
 * The model registry is a process-wide singleton keyed by table name, so a name shared with the
 * sibling engine suite would silently swap one engine's schema for the other's.
 */
const TABLE_NAME = 'pglite_conformance';

const conformanceTable = pgTable(TABLE_NAME, {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  tenant: text('tenant').notNull(),
  score: integer('score'),
  secret: text('secret'),
  tags: text('tags').array(),
});

@model({ type: 'entity', settings: { hiddenProperties: ['secret'] } })
class ConformanceEntity extends BasePostgresEntity {
  static override TABLE_NAME = TABLE_NAME;
  static override schema = conformanceTable;
}

@model({
  type: 'entity',
  settings: { hiddenProperties: ['secret'], defaultFilter: { where: { tenant: 'acme' } } },
})
class ScopedConformanceEntity extends BasePostgresEntity {
  static override TABLE_NAME = TABLE_NAME;
  static override schema = conformanceTable;
}

@datasource({ driver: PGliteDriver })
class ConformancePostgresDataSource extends BasePostgresDataSource<{}, AnyType, {}, PGlite> {
  constructor(opts: { client: PGlite }) {
    super({
      name: ConformancePostgresDataSource.name,
      config: {},
      schema: { [ConformanceEntity.TABLE_NAME]: conformanceTable },
    });

    this.client = opts.client;
  }

  override configure(): ValueOrPromise<void> {}

  override getConnectionString(): ValueOrPromise<string> {
    return 'pglite://memory';
  }
}

/**
 * ONE PGlite boot for the whole suite - it costs seconds, and every test re-seeds the single table.
 */
let client: PGlite;
let harness: IConformanceHarness;

beforeAll(async () => {
  client = new PGlite();
  await client.waitReady;

  await client.exec(`
    CREATE TABLE ${TABLE_NAME} (
      id serial primary key,
      name text not null,
      tenant text not null,
      score integer,
      secret text,
      tags text[]
    );
  `);

  const dataSource = new ConformancePostgresDataSource({ client });

  harness = {
    repository: new DefaultCRUDRepository<AnyType>(dataSource as AnyType, {
      entityClass: ConformanceEntity,
    }) as TConformanceRepository,
    scopedRepository: new DefaultCRUDRepository<AnyType>(dataSource as AnyType, {
      entityClass: ScopedConformanceEntity,
    }) as TConformanceRepository,
    beginTransaction: (): Promise<IRelationalTransaction<AnyType>> => dataSource.beginTransaction(),
  };
});

afterAll(async () => {
  await client.close();
});

runRepositoryConformance({
  engine: 'postgres (PGlite)',
  capabilities: {
    rowLocking: true,
    regexp: true,
    arrayOperators: true,
    caseInsensitiveLike: false,
    nullsSortHigh: true,
  },
  build: () => harness,
});
