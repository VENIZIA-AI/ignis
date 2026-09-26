import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { PGlite } from '@electric-sql/pglite';
import { jsonb, pgTable, serial, text } from 'drizzle-orm/pg-core';
import type { TWhere } from '@venizia/ignis-filter';
import { datasource, model } from '@venizia/ignis-kernel';
import { BasePostgresDataSource, BasePostgresEntity } from '@venizia/ignis-connectors/postgres';
import { DefaultRelationalRepository } from '@venizia/ignis-connectors/relational';
import { PGliteDriver } from '@venizia/ignis-connectors/postgres/pglite';
import type { ValueOrPromise } from '@venizia/ignis-helpers/common';

/**
 * Typing a JSON-path key in `TWhere<T>` changes no runtime path: a typed JSON-path where still
 * reaches Postgres and returns the matching rows. PGlite is Postgres in WASM.
 */

const TABLE_NAME = 'json_path_where_pglite';

const table = pgTable(TABLE_NAME, {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  metadata: jsonb('metadata'),
  settings: jsonb('settings').$type<{ theme: string; limits: { max: number } }>(),
});

type TRow = typeof table.$inferSelect;

@model({ type: 'entity' })
class JsonPathWhereEntity extends BasePostgresEntity<typeof table> {
  static override TABLE_NAME = TABLE_NAME;
  static override schema = table;
}

@datasource({ driver: PGliteDriver, autoDiscovery: false })
class JsonPathWhereDataSource extends BasePostgresDataSource<{}, {}, {}, PGlite> {
  constructor(opts: { client: PGlite }) {
    super({ name: JsonPathWhereDataSource.name, config: {}, schema: { [TABLE_NAME]: table } });
    this.client = opts.client;
  }

  override configure(): ValueOrPromise<void> {}

  override getConnectionString(): ValueOrPromise<string> {
    return 'pglite://memory';
  }

  /** `end()` through the driver is the path that clears the exit status PGlite plants on the host process. */
  endDriver(): Promise<void> {
    return this.resolveDriver().end();
  }
}

let dataSource: JsonPathWhereDataSource;
let repository: DefaultRelationalRepository<typeof table>;

beforeAll(async () => {
  const client = new PGlite();
  await client.waitReady;
  await client.exec(
    `CREATE TABLE ${TABLE_NAME} (id serial primary key, name text not null, metadata jsonb, settings jsonb);`,
  );

  dataSource = new JsonPathWhereDataSource({ client });
  repository = new DefaultRelationalRepository<typeof table>(dataSource, {
    entityClass: JsonPathWhereEntity,
  });

  await repository.createAll({
    data: [
      {
        name: 'alpha',
        metadata: { level: { rank: 1 }, tags: ['red'] },
        settings: { theme: 'dark', limits: { max: 5 } },
      },
      {
        name: 'beta',
        metadata: { level: { rank: 3 }, tags: ['blue'] },
        settings: { theme: 'light', limits: { max: 20 } },
      },
      {
        name: 'gamma',
        metadata: { level: { rank: 5 }, tags: ['red'] },
        settings: { theme: 'dark', limits: { max: 50 } },
      },
    ],
  });
});

afterAll(async () => {
  await dataSource?.endDriver();
});

describe('a typed JSON-path where runs on PGlite', () => {
  test('a pre-built TWhere<T> with a dot path, an index path and an operator', async () => {
    const where: TWhere<TRow> = {
      'metadata.level.rank': { gte: 2 },
      'metadata.tags[0]': 'red',
    };

    const rows = await repository.find({ filter: { where } });

    expect(rows.map(row => row.name)).toEqual(['gamma']);
  });

  test('an inline JSON path on a typed jsonb column inside or, beside a regular column', async () => {
    const rows = await repository.find({
      filter: {
        where: {
          or: [{ 'settings.limits.max': { lt: 10 } }, { name: 'beta' }],
          'settings.theme': { inq: ['dark', 'light'] },
        },
        order: ['name ASC'],
      },
    });

    expect(rows.map(row => row.name)).toEqual(['alpha', 'beta']);
  });
});
