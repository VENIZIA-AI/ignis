import { generateIdColumnDefs } from '@/connectors/sqlite/models';
import { SqliteFilterBuilder } from '@/connectors/sqlite/repositories/dialect/filter';
import { SqliteQueryDialect } from '@/connectors/sqlite/repositories/dialect/query-dialect';
import type { AnyType } from '@venizia/ignis-helpers/common';
import { describe, expect, test } from 'bun:test';
import type { SQL } from 'drizzle-orm';
import { real, SQLiteSyncDialect, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Every expectation below is Drizzle's own compilation of the emitted expression, not a
 * hand-written string compared against another hand-written string. `SQLiteDialect` is abstract;
 * `SQLiteSyncDialect` is its concrete form and compiles identically.
 */
const table = sqliteTable('sqlite_dialect_fixture', {
  ...generateIdColumnDefs(),
  title: text('title'),
  score: real('score'),
  // Property and column names diverge on purpose: the JSON expressions are keyed by the SCHEMA
  // PROPERTY while the emitted SQL quotes the DB COLUMN.
  metadata: text('meta_data', { mode: 'json' }),
});

const TABLE_NAME = 'sqlite_dialect_fixture';

const sqliteDialect = new SQLiteSyncDialect();
const dialect = new SqliteQueryDialect();

const compile = (expression: SQL | undefined) =>
  expression ? sqliteDialect.sqlToQuery(expression) : { sql: '', params: [] };

const toWhere = (where: AnyType) =>
  compile(dialect.toWhere({ tableName: TABLE_NAME, schema: table, where })).sql;

const toOrderBy = (order: string[]) =>
  dialect
    .toOrderBy({ tableName: TABLE_NAME, schema: table, order })
    .map(entry => compile(entry).sql);

const transform = (data: Record<string, unknown>) =>
  dialect.transformUpdate({ tableName: TABLE_NAME, schema: table, data });

describe('SqliteFilterBuilder - plain where', () => {
  test('a bare value compiles to a bound equality against the DB column', () => {
    const query = compile(
      dialect.toWhere({ tableName: TABLE_NAME, schema: table, where: { title: 'ignis' } }),
    );

    expect(query.sql).toBe(`"sqlite_dialect_fixture"."title" = ?`);
    expect(query.params).toEqual(['ignis']);
  });

  test('operators, logical groups and null handling are inherited unchanged', () => {
    const emitted = toWhere({ or: [{ score: { gte: 1 } }, { title: null }] });

    expect(emitted).toContain(' or ');
    expect(emitted).toContain('>=');
    expect(emitted).toContain('is null');
  });

  test('an unknown column is rejected rather than interpolated', () => {
    expect(() => toWhere({ nope: 1 })).toThrow(
      `[FilterBuilder][toWhere] Table: ${TABLE_NAME} | Column NOT FOUND | key: 'nope'`,
    );
  });
});

describe('SqliteFilterBuilder - JSON-path where', () => {
  test('a JSON path becomes json_extract over the DB column, never Postgres #>>', () => {
    const emitted = toWhere({ 'metadata.tier': { eq: 'gold' } });

    expect(emitted).toContain(`json_extract("meta_data", '$."tier"')`);
    expect(emitted).not.toContain('#>>');
  });

  test('a bare JSON-path value takes the same equality branch as { eq }', () => {
    expect(toWhere({ 'metadata.tier': 'gold' })).toBe(toWhere({ 'metadata.tier': { eq: 'gold' } }));
  });

  test('a bare JSON-path array takes the membership branch', () => {
    expect(toWhere({ 'metadata.tier': ['gold', 'silver'] })).toBe(
      toWhere({ 'metadata.tier': { inq: ['gold', 'silver'] } }),
    );
  });

  test('a numeric component becomes a bracket subscript - $."items"."0" reads an object key, not an array element', () => {
    expect(toWhere({ 'metadata.items[0].name': 'a' })).toContain(
      `json_extract("meta_data", '$."items"[0]."name"')`,
    );
  });

  test('a numeric operand gets NO cast - json_extract already returns INTEGER or REAL', () => {
    const emitted = toWhere({ 'metadata.score': { gt: 50 } });

    expect(emitted).not.toContain('CAST');
    expect(emitted).not.toContain('::numeric');
    expect(emitted).toContain(`json_extract("meta_data", '$."score"') >`);
  });

  test('a nested not keeps the same cast-free extraction', () => {
    const emitted = toWhere({ 'metadata.score': { not: { gt: 50 } } });

    expect(emitted).not.toContain('CAST');
    expect(emitted.toLowerCase()).toContain('not');
  });

  test('a JSON path on a column that is not json-mode is rejected', () => {
    expect(() => toWhere({ 'title.tier': 'gold' })).toThrow(
      `Table: ${TABLE_NAME} | Column 'title' is not a JSON column`,
    );
  });

  test('an invalid path component is rejected before it can reach sql.raw', () => {
    expect(() => toWhere({ 'metadata.bad!': 1 })).toThrow(`Invalid JSON path component: 'bad!'`);
  });
});

describe('SqliteFilterBuilder - JSON-path order by', () => {
  test('order by a JSON path compiles to json_extract plus a direction', () => {
    expect(toOrderBy(['metadata.tier DESC'])[0]).toBe(`json_extract("meta_data", '$."tier"') DESC`);
  });

  test('a plain column order by is inherited unchanged', () => {
    expect(toOrderBy(['title asc'])[0]).toBe(`"sqlite_dialect_fixture"."title" asc`);
  });
});

describe('SqliteQueryDialect.transformUpdate - json_set composition', () => {
  test('a plain column passes through to regularFields untouched', () => {
    const transformed = transform({ title: 'updated' });

    expect(transformed.regularFields).toEqual({ title: 'updated' });
    expect(transformed.jsonExpressions).toEqual({});
  });

  test('a JSON path composes json_set with the path and value BOUND, keyed by the schema property', () => {
    const transformed = transform({ 'metadata.tier': 'gold' });
    const query = compile(transformed.jsonExpressions.metadata);

    expect(Object.keys(transformed.jsonExpressions)).toEqual(['metadata']);
    expect(query.sql).toBe(`json_set("meta_data", ?, json(?))`);
    expect(query.params).toEqual(['$."tier"', '"gold"']);
  });

  test('two paths on one column chain into a single nested json_set so neither is lost', () => {
    const query = compile(
      transform({ 'metadata.tier': 'gold', 'metadata.seats': 3 }).jsonExpressions.metadata,
    );

    expect(query.sql).toBe(`json_set(json_set("meta_data", ?, json(?)), ?, json(?))`);
    expect(query.params).toEqual(['$."tier"', '"gold"', '$."seats"', '3']);
  });

  test('null is written as a JSON null literal, not dropped', () => {
    expect(compile(transform({ 'metadata.tier': null }).jsonExpressions.metadata).params).toEqual([
      '$."tier"',
      'null',
    ]);
  });

  test('an object value is wrapped in json() so it is stored as JSON, not as a string', () => {
    expect(
      compile(transform({ 'metadata.nested': { x: 1 } }).jsonExpressions.metadata).params[1],
    ).toBe('{"x":1}');
  });

  test('toUpdateData merges both buckets into the object handed to set()', () => {
    const transformed = transform({ title: 'updated', 'metadata.tier': 'gold' });
    const updateData = dialect.toUpdateData({ transformed });

    expect(Object.keys(updateData).sort()).toEqual(['metadata', 'title']);
    expect(updateData.title).toBe('updated');
    expect(compile(updateData.metadata as SQL).sql).toContain('json_set');
  });

  test('a JSON path on a column that is not json-mode is rejected', () => {
    expect(() => transform({ 'title.tier': 'gold' })).toThrow(
      `[SqliteUpdateBuilder.transform] Table: ${TABLE_NAME} | Column 'title' is not a JSON column | dataType: 'string'`,
    );
  });
});

describe('SqliteQueryOperators - capability gaps refuse instead of approximating', () => {
  const gaps: Array<{ operator: string; where: AnyType }> = [
    { operator: 'regexp', where: { title: { regexp: '^a' } } },
    { operator: 'iregexp', where: { title: { iregexp: '^a' } } },
    { operator: 'contains', where: { title: { contains: ['a'] } } },
    { operator: 'containedBy', where: { title: { containedBy: ['a'] } } },
    { operator: 'overlaps', where: { title: { overlaps: ['a'] } } },
  ];

  for (const gap of gaps) {
    test(`'${gap.operator}' throws NotSupported naming itself`, () => {
      expect(() => toWhere(gap.where)).toThrow(`[SqliteQueryOperators] Operator '${gap.operator}'`);
    });
  }

  test('the refusal is a 501, not a generic failure', () => {
    try {
      toWhere({ title: { regexp: '^a' } });
      throw new Error('expected a NotSupported throw');
    } catch (error) {
      expect((error as { statusCode?: number }).statusCode).toBe(501);
    }
  });
});

describe("SqliteQueryOperators - 'ilike' maps to LIKE", () => {
  /**
   * SQLite's LIKE is ASCII case-insensitive by default, so LIKE already IS ilike. Refusing ilike
   * would only push the caller to write like and get the identical SQL.
   */
  test('ilike and like compile to the same expression', () => {
    expect(toWhere({ title: { ilike: '%a%' } })).toBe(toWhere({ title: { like: '%a%' } }));
  });

  test('nilike and nlike compile to the same expression', () => {
    expect(toWhere({ title: { nilike: '%a%' } })).toBe(toWhere({ title: { nlike: '%a%' } }));
  });

  test('the emitted operator is LIKE, never ILIKE', () => {
    const emitted = toWhere({ title: { ilike: '%a%' } }).toLowerCase();

    expect(emitted).toContain('like');
    expect(emitted).not.toContain('ilike');
  });
});

describe('SqliteFilterBuilder - the neutral walk is inherited, not reimplemented', () => {
  test('mergeFilter, build and hidden-column handling come from the neutral base', () => {
    expect(new SqliteFilterBuilder()).toBeInstanceOf(SqliteFilterBuilder);

    const built = dialect.build({
      tableName: TABLE_NAME,
      schema: table,
      filter: { where: { title: 'a' }, order: ['metadata.tier DESC'], limit: 5, fields: ['title'] },
    });

    expect(built.limit).toBe(5);
    expect(built.columns).toEqual({ title: true });
    expect(compile(built.orderBy?.[0]).sql).toContain('json_extract');
  });
});
