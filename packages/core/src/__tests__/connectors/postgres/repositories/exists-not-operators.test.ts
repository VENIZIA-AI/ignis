import { describe, expect, test } from 'bun:test';
import { pgTable, serial, varchar, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { PostgresFilterBuilder } from '@/connectors/postgres/repositories/dialect/filter';

const table = pgTable('exists_fixture', {
  id: serial('id').primaryKey(),
  status: varchar('status', { length: 50 }),
  deletedAt: timestamp('deleted_at'),
  metadata: jsonb('metadata'),
});

const builder = new PostgresFilterBuilder();
const dialect = new PgDialect();

const compile = (where: any): { text: string; params: unknown[] } => {
  const condition = builder.toWhere({ tableName: 'exists_fixture', schema: table, where }) as SQL;
  const { sql, params } = dialect.sqlToQuery(condition);
  return { text: sql, params };
};

/** `exists`/`notExists`/`not` are in the neutral QueryOperators vocabulary but previously had no Postgres handler, so `{ deletedAt: { exists: false } }` threw 'Invalid query operator'. */
describe('FilterBuilder - exists / notExists operators', () => {
  test('exists: true -> IS NOT NULL', () => {
    expect(compile({ deletedAt: { exists: true } }).text).toContain('is not null');
  });

  test('exists: false -> IS NULL', () => {
    const text = compile({ deletedAt: { exists: false } }).text;
    expect(text).toContain('is null');
    expect(text).not.toContain('is not null');
  });

  test('notExists: true -> IS NULL', () => {
    const text = compile({ deletedAt: { notExists: true } }).text;
    expect(text).toContain('is null');
    expect(text).not.toContain('is not null');
  });

  test('notExists: false -> IS NOT NULL', () => {
    expect(compile({ deletedAt: { notExists: false } }).text).toContain('is not null');
  });
});

describe('FilterBuilder - not operator', () => {
  test('not: <operatorObject> -> not(<nested condition>)', () => {
    const { text, params } = compile({ status: { not: { eq: 'active' } } });
    expect(text).toContain('not');
    expect(text).toContain('=');
    expect(params).toContain('active');
  });

  test('not: <bareValue> -> not(eq(column, value))', () => {
    const { text, params } = compile({ status: { not: 'active' } });
    expect(text).toContain('not');
    expect(text).toContain('=');
    expect(params).toContain('active');
  });
});

describe('FilterBuilder - exists / notExists on JSON paths', () => {
  test('json-path exists: false -> IS NULL on the extraction', () => {
    const text = compile({ 'metadata.deletedAt': { exists: false } }).text;
    expect(text).toContain('is null');
  });

  test('json-path exists: true -> IS NOT NULL on the extraction', () => {
    const text = compile({ 'metadata.deletedAt': { exists: true } }).text;
    expect(text).toContain('is not null');
  });
});
