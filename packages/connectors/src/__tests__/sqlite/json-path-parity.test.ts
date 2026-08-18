import { generateIdColumnDefs } from '@/relational/sqlite/models';
import { SqliteQueryDialect } from '@/relational/sqlite/repositories/dialect/query-dialect';
import type { Client } from '@libsql/client';
import { createClient } from '@libsql/client';
import type { AnyType } from '@venizia/ignis-helpers/common';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import type { SQL } from 'drizzle-orm';
import { blob, SQLiteSyncDialect, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * A numeric path component is ambiguous: `metadata.counts.0` is an array element on
 * one document and an object key spelled "0" on another. Postgres's `#>> '{counts,0}'`
 * addresses both, so these pin that SQLite agrees - against a REAL libsql database,
 * since the failure mode is a query that compiles and then matches nothing.
 */
const table = sqliteTable('json_parity_fixture', {
  ...generateIdColumnDefs(),
  metadata: text('meta_data', { mode: 'json' }),
  payload: blob('payload_blob', { mode: 'json' }),
});

const TABLE_NAME = 'json_parity_fixture';

const sqliteDialect = new SQLiteSyncDialect();
const dialect = new SqliteQueryDialect();

const compile = (expression: SQL) => sqliteDialect.sqlToQuery(expression);

const toWhere = (where: AnyType) =>
  compile(dialect.toWhere({ tableName: TABLE_NAME, schema: table, where }) as SQL);

const toOrderBy = (order: string[]) =>
  dialect.toOrderBy({ tableName: TABLE_NAME, schema: table, order }).map(entry => compile(entry));

const transform = (data: Record<string, unknown>) =>
  dialect.transformUpdate({ tableName: TABLE_NAME, schema: table, data });

let client: Client;

/** Rows the where-clause tests select from: one JSON object keyed "0", one JSON array. */
const seed = async () => {
  await client.executeMultiple(`
    DELETE FROM json_parity_fixture;
    INSERT INTO json_parity_fixture (id, meta_data) VALUES
      (1, '{"counts":{"0":9}}'),
      (2, '{"counts":[9]}'),
      (3, '{"counts":{"0":1}}');
  `);
};

const selectMatchingIds = async (where: AnyType): Promise<number[]> => {
  const query = toWhere(where);
  const result = await client.execute({
    sql: `SELECT id FROM ${TABLE_NAME} WHERE ${query.sql} ORDER BY id`,
    args: query.params as AnyType[],
  });

  return result.rows.map(row => Number(row.id));
};

const applyUpdate = async (opts: { document: string; data: Record<string, unknown> }) => {
  const { document, data } = opts;

  await client.execute({
    sql: `INSERT INTO ${TABLE_NAME} (id, meta_data) VALUES (99, ?)`,
    args: [document],
  });

  const query = compile(transform(data).jsonExpressions.metadata);
  await client.execute({
    sql: `UPDATE ${TABLE_NAME} SET meta_data = ${query.sql} WHERE id = 99`,
    args: query.params as AnyType[],
  });

  const result = await client.execute(`SELECT meta_data FROM ${TABLE_NAME} WHERE id = 99`);
  return String(result.rows[0].meta_data);
};

beforeAll(async () => {
  client = createClient({ url: ':memory:' });

  await client.execute(`
    CREATE TABLE json_parity_fixture (
      id integer primary key autoincrement,
      meta_data text,
      payload_blob blob
    )
  `);
});

afterAll(() => {
  client.close();
});

beforeEach(seed);

describe('SqliteFilterBuilder - a numeric JSON path component addresses BOTH readings', () => {
  test('the emitted extraction offers the array subscript AND the object key', () => {
    const emitted = toWhere({ 'metadata.counts.0': { gt: 5 } }).sql;

    expect(emitted).toContain(`json_extract("meta_data", '$."counts"[0]')`);
    expect(emitted).toContain(`json_extract("meta_data", '$."counts"."0"')`);
  });

  // Verified against PGlite: `'{"counts":{"0":9}}'::jsonb #>>
  // '{counts,0}'` is 9, and so is the array form. Row 1 is the object
  // key, row 2 the array element; before the fix only row 2 matched.
  test('the object key AND the array element match, as they both do on Postgres', async () => {
    expect(await selectMatchingIds({ 'metadata.counts.0': { gt: 5 } })).toEqual([1, 2]);
  });

  test('the object reading participates rather than matching everything', async () => {
    expect(await selectMatchingIds({ 'metadata.counts.0': { lt: 5 } })).toEqual([3]);
  });

  test('the bracket spelling parses to the same path and answers the same', async () => {
    expect(await selectMatchingIds({ 'metadata.counts[0]': { gt: 5 } })).toEqual([1, 2]);
  });

  test('a non-numeric component keeps emitting a single extraction', () => {
    const emitted = toWhere({ 'metadata.tier': 'gold' }).sql;

    expect(emitted).toBe(`json_extract("meta_data", '$."tier"') = ?`);
  });

  test('order by a numeric component offers both readings too', () => {
    expect(toOrderBy(['metadata.counts.0 DESC'])[0].sql).toContain(`'$."counts"."0"'`);
  });

  test('a path whose numeric components would explode the candidate set is refused', () => {
    expect(() => toWhere({ 'metadata.a.0.1.2.3.4': 1 })).toThrow('Ambiguous JSON path components');
  });
});

describe('SqliteUpdateBuilder - a numeric JSON path component writes BOTH readings', () => {
  test('writing a numeric OBJECT KEY reaches the key, as jsonb_set does on Postgres', async () => {
    const updated = await applyUpdate({
      document: '{"counts":{"0":1}}',
      data: { 'metadata.counts.0': 9 },
    });

    expect(JSON.parse(updated)).toEqual({ counts: { '0': 9 } });
  });

  test('writing an ARRAY element still reaches the element', async () => {
    const updated = await applyUpdate({
      document: '{"counts":[1]}',
      data: { 'metadata.counts.0': 9 },
    });

    expect(JSON.parse(updated)).toEqual({ counts: [9] });
  });

  test('a non-numeric component keeps emitting a single json_set', () => {
    expect(compile(transform({ 'metadata.tier': 'gold' }).jsonExpressions.metadata).sql).toBe(
      `json_set("meta_data", ?, json(?))`,
    );
  });
});

describe('SQLite refuses a blob-mode json column instead of compiling it', () => {
  /**
   * Why the refusal exists, pinned against libsql rather than taken from the docs:
   * SQLite reads a BLOB json argument as JSONB while Drizzle stores `blob(mode: 'json')`
   * as UTF-8 text, so payloads whose byte length resembles a JSONB header fail per-row.
   */
  test('libsql misreads a JSON-text blob whose length looks like a JSONB header', async () => {
    const document = '{"t":12}';
    const hex = Buffer.from(document, 'utf8').toString('hex');

    const result = await client.execute(`
      SELECT json_valid(x'${hex}') AS is_valid,
             json_extract(x'${hex}', '$."t"') AS from_blob,
             json_extract('${document}', '$."t"') AS from_text
    `);

    // Identical bytes, identical path: as TEXT the
    // value comes back, as a BLOB the row answers NULL.
    expect(result.rows[0].is_valid).toBe(0);
    expect(result.rows[0].from_blob).toBeNull();
    expect(result.rows[0].from_text).toBe(12);
  });

  test('the same misreading raises malformed JSON when the path reaches an array', async () => {
    const hex = Buffer.from('[1,23]', 'utf8').toString('hex');

    const message = await client.execute(`SELECT json_extract(x'${hex}', '$[0]') AS v`).then(
      () => '',
      (error: Error) => error.message,
    );

    expect(message).toContain('malformed JSON');
  });

  test('a where on a blob-mode json column is refused', () => {
    expect(() => toWhere({ 'payload.tier': 'gold' })).toThrow(
      `[SqliteFilterBuilder][buildJsonWhereCondition] Table: ${TABLE_NAME} | Column 'payload_blob' is a blob-mode JSON column`,
    );
  });

  test('an order by on a blob-mode json column is refused', () => {
    expect(() => toOrderBy(['payload.tier ASC'])).toThrow('is a blob-mode JSON column');
  });

  test('an update through a blob-mode json column is refused', () => {
    expect(() => transform({ 'payload.tier': 'gold' })).toThrow(
      `[SqliteUpdateBuilder][transform] Table: ${TABLE_NAME} | Column 'payload_blob' is a blob-mode JSON column`,
    );
  });

  test('the refusal names the column mode that does work', () => {
    expect(() => toWhere({ 'payload.tier': 'gold' })).toThrow(`text(name, { mode: 'json' })`);
  });

  test('a text-mode json column is untouched by the refusal', () => {
    expect(toWhere({ 'metadata.tier': 'gold' }).sql).toContain('json_extract');
    expect(transform({ 'metadata.tier': 'gold' }).jsonExpressions.metadata).toBeDefined();
  });
});
