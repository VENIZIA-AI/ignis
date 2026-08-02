import { describe, expect, test } from 'bun:test';
import { pgTable, serial, jsonb } from 'drizzle-orm/pg-core';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { PostgresFilterBuilder } from '@/connectors/postgres/repositories/dialect/filter';

const table = pgTable('json_numeric_fixture', {
  id: serial('id').primaryKey(),
  metadata: jsonb('metadata'),
});

const builder = new PostgresFilterBuilder();
const dialect = new PgDialect();

const compile = (where: any): string => {
  const condition = builder.toWhere({
    tableName: 'json_numeric_fixture',
    schema: table,
    where,
  }) as SQL;
  return dialect.sqlToQuery(condition).sql;
};

/** eq/ne/neq/inq/nin with numeric values must route through the same numeric cast as the bare-value branch - a text extraction produces 'operator does not exist: text = integer'. */
describe('FilterBuilder - JSON path numeric equality operators cast to numeric', () => {
  test('eq with a numeric value casts the extraction to numeric', () => {
    expect(compile({ 'metadata.score': { eq: 50 } })).toContain('numeric');
  });

  test('neq with a numeric value casts the extraction to numeric', () => {
    expect(compile({ 'metadata.score': { neq: 50 } })).toContain('numeric');
  });

  test('inq with numeric values casts the extraction to numeric', () => {
    expect(compile({ 'metadata.score': { inq: [10, 20] } })).toContain('numeric');
  });

  test('nin with numeric values casts the extraction to numeric', () => {
    expect(compile({ 'metadata.score': { nin: [10, 20] } })).toContain('numeric');
  });

  test('bare numeric value still casts to numeric (unchanged)', () => {
    expect(compile({ 'metadata.score': 50 })).toContain('numeric');
  });

  test('eq with a string value stays text (no numeric cast)', () => {
    expect(compile({ 'metadata.status': { eq: 'active' } })).not.toContain('numeric');
  });

  test('inq with string values stays text (no numeric cast)', () => {
    expect(compile({ 'metadata.status': { inq: ['a', 'b'] } })).not.toContain('numeric');
  });
});
