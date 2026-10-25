import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { boolean, pgTable, serial, text } from 'drizzle-orm/pg-core';
import type { AnyType } from '@venizia/ignis-helpers/common';
import { MetadataRegistry, model } from '@venizia/ignis-kernel';
import { BaseRelationalEntity } from '@/relational/core/models';
import { PGliteDriver } from '@/relational/postgres/drivers/pglite';
import { DefaultCRUDRepository } from '@/relational/postgres/repositories';
import { PostgresQueryDialect } from '@/relational/postgres/repositories/dialect/query-dialect';
import { PostgresQueryExecutor } from '@/relational/postgres/repositories/executor';

/**
 * The same model declared with the deprecated flat keys and with the grouped `query` / `access`
 * keys must behave identically: scope reads, the default filter and its skip, the limits and the
 * write guard.
 */
const productsTable = pgTable('settings_shapes_products', {
  id: serial('id').primaryKey(),
  merchantId: text('merchant_id'),
  name: text('name'),
  isDeleted: boolean('is_deleted').default(false),
});

let scope: AnyType = { merchantId: 'm-a' };
const resolve = () => scope;

@model({
  type: 'entity',
  settings: {
    defaultFilter: { where: { isDeleted: false } },
    defaultLimit: 2,
    maxLimit: 3,
    scopeFilter: { resolve, writeGuard: 'assign', sharedRows: true },
  },
})
class OldShapeProduct extends BaseRelationalEntity<typeof productsTable> {
  static override schema = productsTable;
  static override TABLE_NAME = 'settings_shapes_products';
}

@model({
  type: 'entity',
  settings: {
    query: { filter: { where: { isDeleted: false } }, limit: { default: 2, max: 3 } },
    access: { resolve, write: { mode: 'assign', sharedRows: true } },
  },
})
class NewShapeProduct extends BaseRelationalEntity<typeof productsTable> {
  static override schema = productsTable;
  static override TABLE_NAME = 'settings_shapes_products';
}

/** The message a refused write carries, or an empty string when it went through. */
const failure = async (task: Promise<unknown>): Promise<string> => {
  try {
    await task;
  } catch (error) {
    return String((error as Error).message);
  }

  return '';
};

describe.each([
  ['the deprecated flat keys', OldShapeProduct],
  ['the grouped query / access keys', NewShapeProduct],
])('model settings declared with %s', (_label, entityClass) => {
  const client = new PGlite();
  let driver: PGliteDriver<AnyType>;
  let repository: DefaultCRUDRepository<AnyType>;

  const names = async (opts?: { skipDefaultFilter?: boolean }) => {
    const rows = await repository.find({
      filter: { order: ['id asc'], limit: 3 },
      options: { shouldSkipDefaultFilter: opts?.skipDefaultFilter },
    });
    return rows.map((row: AnyType) => row.name as string);
  };

  beforeAll(async () => {
    await client.waitReady;
    driver = new PGliteDriver<AnyType>({ client });
    await client.exec(
      'CREATE TABLE settings_shapes_products (id serial primary key, merchant_id text, name text, is_deleted boolean default false)',
    );

    const dataSource = {
      getQueryDialect: () => new PostgresQueryDialect(),
      getQueryExecutor: () => new PostgresQueryExecutor(),
      getConnector: () => driver.createConnector({ schema: { productsTable } }),
    } as AnyType;
    repository = new DefaultCRUDRepository<AnyType>(dataSource, { entityClass });
  }, 30_000);

  beforeEach(async () => {
    scope = { merchantId: 'm-a' };
    await client.exec(`
      TRUNCATE settings_shapes_products RESTART IDENTITY;
      INSERT INTO settings_shapes_products (merchant_id, name, is_deleted) VALUES
        ('m-a', 'a-1', false), ('m-a', 'a-2', false), ('m-a', 'a-3', false),
        ('m-a', 'a-gone', true), ('m-b', 'b-1', false);
    `);
  });

  afterAll(async () => {
    await driver.end();
  });

  test('the scope narrows reads to the resolved merchant', async () => {
    expect(await names()).toEqual(['a-1', 'a-2', 'a-3']);

    scope = { merchantId: 'm-b' };
    expect(await names()).toEqual(['b-1']);
  });

  test('the default filter hides deleted rows and shouldSkipDefaultFilter lifts it, not the scope', async () => {
    expect(await names()).not.toContain('a-gone');
    expect(await names({ skipDefaultFilter: true })).toEqual(['a-1', 'a-2', 'a-3']);

    const all = await repository.find({
      filter: { order: ['id asc'], limit: 3, offset: 3 },
      options: { shouldSkipDefaultFilter: true },
    });
    expect(all.map((row: AnyType) => row.name)).toEqual(['a-gone']);
  });

  test('a query that names no limit gets the default limit', async () => {
    const rows = await repository.find({ filter: { order: ['id asc'] } });

    expect(rows.map((row: AnyType) => row.name)).toEqual(['a-1', 'a-2']);
  });

  test('the registry holds the same limits and ceiling for both shapes', () => {
    const settings = MetadataRegistry.getInstance().getModelMetadata({
      target: entityClass,
    })?.settings;

    expect(settings?.query?.limit).toEqual({ default: 2, max: 3 });
  });

  test('the write guard: refuses another merchant, assigns an absent column, allows shared null', async () => {
    expect(await failure(repository.create({ data: { merchantId: 'm-b', name: 'x' } }))).toMatch(
      /outside the resolved scope/,
    );

    await repository.create({ data: { name: 'assigned' } });
    await repository.create({ data: { merchantId: null, name: 'shared' } });

    const stored = await client.query<{ name: string; merchantId: string | null }>(
      `SELECT name, merchant_id AS "merchantId" FROM settings_shapes_products WHERE name IN ('assigned', 'shared') ORDER BY id`,
    );
    expect(stored.rows).toEqual([
      { name: 'assigned', merchantId: 'm-a' },
      { name: 'shared', merchantId: null },
    ]);
  });
});
