import { datasource, model, MetadataRegistry } from '@venizia/ignis-kernel';
import { BasePostgresDataSource } from '@/relational/postgres/datasources';
import { PGliteDriver } from '@/relational/postgres/drivers/pglite';
import { BasePostgresEntity } from '@/relational/postgres/models';
import { DefaultCRUDRepository } from '@/relational/postgres/repositories';
import { PostgresFilterBuilder } from '@/relational/postgres/repositories/dialect/filter';
import type { IDatabaseExtraOptions } from '@/relational/postgres/repositories/common';
import type { TTableInsert, TTableObject, TTableSchemaWithId } from '@/relational/core/models';
import { PGlite } from '@electric-sql/pglite';
import type { ValueOrPromise } from '@venizia/ignis-helpers/common';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { pgTable, serial, text } from 'drizzle-orm/pg-core';

// Two models over one drizzle table: the schema object no longer names ONE of them, so the registry
// drops that mapping rather than answering with whichever registered last - which would apply the
// wrong `hiddenProperties` and return a hidden column.
const TABLE_NAME = 'shared_table_account';

const accountTable = pgTable(TABLE_NAME, {
  id: serial('id').primaryKey(),
  email: text('email').notNull(),
  secret: text('secret').notNull(),
});

@model({ type: 'entity', settings: { hiddenProperties: ['secret'] } })
class SharedTableAccount extends BasePostgresEntity<typeof accountTable> {
  static override TABLE_NAME = TABLE_NAME;
  static override schema = accountTable;
}

/** Registered after, under another name, with no settings - the one that used to win. */
@model({ type: 'entity', tableName: `${TABLE_NAME}_public` })
class SharedTableAccountPublic extends BasePostgresEntity<typeof accountTable> {
  static override TABLE_NAME = `${TABLE_NAME}_public`;
  static override schema = accountTable;
}

@datasource({ driver: PGliteDriver })
class SharedTableDataSource extends BasePostgresDataSource<{}, {}, {}, PGlite> {
  constructor(opts: { client: PGlite }) {
    super({
      name: SharedTableDataSource.name,
      config: {},
      schema: { [SharedTableAccount.name]: accountTable },
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

type TRepository<Schema extends TTableSchemaWithId> = DefaultCRUDRepository<
  Schema,
  TTableObject<Schema>,
  TTableInsert<Schema>,
  IDatabaseExtraOptions,
  SharedTableDataSource
>;

interface IAccountRow {
  id: number;
  email: string;
  secret?: string;
}

let dataSource: SharedTableDataSource;
let repository: TRepository<typeof accountTable>;

beforeAll(async () => {
  const client = new PGlite();
  await client.waitReady;
  await client.exec(`
    CREATE TABLE ${TABLE_NAME} (id serial primary key, email text not null, secret text not null);
    INSERT INTO ${TABLE_NAME} (email, secret) VALUES ('a@b.c', 'top-secret');
  `);

  dataSource = new SharedTableDataSource({ client });
  repository = new DefaultCRUDRepository<
    typeof accountTable,
    TTableObject<typeof accountTable>,
    TTableInsert<typeof accountTable>,
    IDatabaseExtraOptions,
    SharedTableDataSource
  >(dataSource, { entityClass: SharedTableAccount });
});

afterAll(async () => {
  await dataSource.endDriver();
});

describe('a table claimed by two models keeps the settings of the model that names it', () => {
  test('the registry refuses to answer by schema once the claim is ambiguous', () => {
    const registry = MetadataRegistry.getInstance();

    expect(registry.getModelEntryBySchema({ schema: accountTable })).toBeUndefined();
    expect(registry.getModelEntry({ name: TABLE_NAME })?.target).toBe(SharedTableAccount);
    expect(registry.getModelEntry({ name: `${TABLE_NAME}_public` })?.target).toBe(
      SharedTableAccountPublic,
    );
  });

  test('a read still hides the column the naming model hides', async () => {
    const rows = await repository.find<IAccountRow>({ filter: {} });

    expect(rows).toEqual([{ id: 1, email: 'a@b.c' }]);
  });

  // The path that reads the schema map: an included relation is known by its table object alone.
  test("hidden properties resolved from the schema object are still the naming model's", () => {
    const hidden = new PostgresFilterBuilder().resolveHiddenProperties({ schema: accountTable });

    expect([...hidden]).toEqual(['secret']);
  });
});
