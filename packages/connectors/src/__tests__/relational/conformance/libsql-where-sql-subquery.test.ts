import { isApplicationError } from '@venizia/ignis-helpers/core';
import { SqliteFilterBuilder } from '@/relational/sqlite/repositories/dialect/filter';
import type { ISearchQueryDialect } from '@/search/core/repositories/common';
import { MeilisearchQueryDialect } from '@/search/meilisearch/repositories/dialect/query-dialect';
import { TypesenseQueryDialect } from '@/search/typesense/repositories/dialect/query-dialect';
import type { Client } from '@libsql/client';
import { createClient } from '@libsql/client';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { sql } from 'drizzle-orm';
import type { TWhere } from '@venizia/ignis-kernel';
import { drizzle } from 'drizzle-orm/libsql';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/** The SQLite side of `inSql`/`ninSql`, and the search dialects, which cannot express a subquery. */
const ORDER_TABLE = 'where_sql_sqlite_order';
const TAG_TABLE = 'where_sql_sqlite_tag';

const orderTable = sqliteTable(ORDER_TABLE, {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
});

const tagTable = sqliteTable(TAG_TABLE, {
  id: integer('id').primaryKey(),
  orderId: integer('order_id').notNull(),
  label: text('label').notNull(),
});

const builder = new SqliteFilterBuilder();
let client: Client;

const taggedWith = (label: string) =>
  sql`SELECT ${tagTable.orderId} FROM ${tagTable} WHERE ${tagTable.label} = ${label}`;

const selectIds = async (where: TWhere): Promise<number[]> => {
  const condition = builder.toWhere({ tableName: ORDER_TABLE, schema: orderTable, where });
  const rows = await drizzle(client)
    .select({ id: orderTable.id })
    .from(orderTable)
    .where(condition)
    .orderBy(orderTable.id);
  return rows.map(row => row.id);
};

beforeAll(async () => {
  client = createClient({ url: ':memory:' });
  await client.executeMultiple(`
    CREATE TABLE ${ORDER_TABLE} (id integer primary key, name text not null);
    CREATE TABLE ${TAG_TABLE} (id integer primary key, order_id integer not null, label text not null);
    INSERT INTO ${ORDER_TABLE} (id, name) VALUES (1, 'o1'), (2, 'o2'), (3, 'o3'), (4, 'o4');
    INSERT INTO ${TAG_TABLE} (order_id, label) VALUES (1, 'red'), (2, 'red'), (3, 'blue');
  `);
});

afterAll(() => {
  client.close();
});

describe('SQLite - inSql and ninSql', () => {
  test('inSql keeps the rows the subquery returns', async () => {
    expect(await selectIds({ id: { inSql: taggedWith('red') } })).toEqual([1, 2]);
  });

  test('ninSql drops them', async () => {
    expect(await selectIds({ id: { ninSql: taggedWith('red') } })).toEqual([3, 4]);
  });

  test('an empty subquery matches nothing', async () => {
    expect(await selectIds({ id: { inSql: taggedWith('green') } })).toEqual([]);
  });

  test('inside an or group', async () => {
    expect(
      await selectIds({ or: [{ id: { inSql: taggedWith('blue') } }, { name: 'o4' }] }),
    ).toEqual([3, 4]);
  });

  test('a string is refused with a 400', () => {
    const where: TWhere = { id: { inSql: 'SELECT 1' } };
    try {
      builder.toWhere({ tableName: ORDER_TABLE, schema: orderTable, where });
      throw new Error('expected a refusal');
    } catch (error) {
      expect(isApplicationError(error) && error.statusCode).toBe(400);
    }
  });
});

const SEARCH_DIALECTS: Array<{ name: string; dialect: ISearchQueryDialect }> = [
  { name: 'Typesense', dialect: new TypesenseQueryDialect() },
  { name: 'Meilisearch', dialect: new MeilisearchQueryDialect() },
];

describe.each(SEARCH_DIALECTS)(
  '$name dialect - subquery operators are unsupported',
  ({ dialect }) => {
    test('inSql is refused rather than translated', () => {
      expect(() =>
        dialect.build({ filter: { where: { id: { inSql: taggedWith('red') } } } }),
      ).toThrow(/does not support operator/);
    });

    test('ninSql is refused rather than translated', () => {
      expect(() =>
        dialect.build({ filter: { where: { id: { ninSql: taggedWith('red') } } } }),
      ).toThrow(/does not support operator/);
    });
  },
);
