import type { TWhere } from '@venizia/ignis-kernel';
import { PostgresQueryDialect } from '@/relational/postgres/repositories/dialect/query-dialect';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { jsonb, pgTable, serial } from 'drizzle-orm/pg-core';

/**
 * Postgres reads an unquoted `NULL` element of an array literal as SQL NULL, so a JSON path built as
 * `'{NULL}'` never reaches a key named `NULL`. Every element must be quoted (`'{"NULL"}'`) so each
 * segment is read as text - in where, order and update alike.
 */
const TABLE = 'json_path_null_segment';

const table = pgTable(TABLE, {
  id: serial('id').primaryKey(),
  metadata: jsonb('metadata'),
});

const dialect = new PostgresQueryDialect();

let client: PGlite;

const selectIds = async (opts: { where?: TWhere; order?: string[] }): Promise<number[]> => {
  const db = drizzle(client);
  const base = db.select({ id: table.id }).from(table).$dynamic();
  const filtered = opts.where
    ? base.where(dialect.toWhere({ tableName: TABLE, schema: table, where: opts.where }))
    : base;
  const rows = await filtered.orderBy(
    ...dialect.toOrderBy({ tableName: TABLE, schema: table, order: opts.order ?? ['id ASC'] }),
  );
  return rows.map(row => row.id);
};

beforeAll(async () => {
  client = new PGlite();
  await client.waitReady;
  await client.exec(`
    CREATE TABLE ${TABLE} (id serial primary key, metadata jsonb);
    INSERT INTO ${TABLE} (metadata) VALUES
      ('{"NULL": "b", "k": 1}'),
      ('{"NULL": "c", "k": 3}'),
      ('{"k": 2}');
  `);
});

afterAll(async () => {
  await client.close();
});

describe('a JSON-path segment named NULL is read as a key, not as SQL NULL', () => {
  test('where equality finds the row whose NULL key has that value', async () => {
    expect(await selectIds({ where: { 'metadata.NULL': 'b' } })).toEqual([1]);
  });

  test('where null matches only the row that has no NULL key', async () => {
    expect(await selectIds({ where: { 'metadata.NULL': null } })).toEqual([3]);
  });

  test('lower-case null is a key too', async () => {
    await client.exec(`INSERT INTO ${TABLE} (metadata) VALUES ('{"null": "x"}')`);
    expect(await selectIds({ where: { 'metadata.null': 'x' } })).toEqual([4]);
    await client.exec(`DELETE FROM ${TABLE} WHERE id = 4`);
  });

  test('order by the NULL key sorts by its value', async () => {
    expect(await selectIds({ order: ['metadata.NULL DESC', 'id ASC'] })).toEqual([3, 2, 1]);
  });

  test('an array index segment still works when quoted', async () => {
    await client.exec(`INSERT INTO ${TABLE} (metadata) VALUES ('{"items": ["p", "q"]}')`);
    expect(await selectIds({ where: { 'metadata.items[1]': 'q' } })).toEqual([5]);
    await client.exec(`DELETE FROM ${TABLE} WHERE id = 5`);
  });

  test('an update through a NULL segment writes that key', async () => {
    const transformed = dialect.transformUpdate({
      tableName: TABLE,
      schema: table,
      data: { 'metadata.NULL': 'z' },
    });
    const db = drizzle(client);
    await db
      .update(table)
      .set({ metadata: transformed.jsonExpressions.metadata })
      .where(sql`${table.id} = 1`);

    expect(await selectIds({ where: { 'metadata.NULL': 'z' } })).toEqual([1]);
  });
});
