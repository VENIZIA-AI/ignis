import { describe, expect, test } from 'bun:test';
import type { SQL } from 'drizzle-orm';
import { PgDialect, pgTable, serial, varchar } from 'drizzle-orm/pg-core';
import { PostgresFilterBuilder } from '@/relational/postgres/repositories/dialect/filter';

/**
 * The handlers Postgres keeps for itself and the one error text the docs quote. The shared set is built with the
 * engine's class name as `scope`, so the `between` message is pinned per engine.
 */
const table = pgTable('operator_sql_fixture', {
  id: serial('id').primaryKey(),
  title: varchar('title', { length: 50 }),
  score: serial('score'),
});

const builder = new PostgresFilterBuilder();
const dialect = new PgDialect();

const compile = (where: Record<string, unknown>) => {
  const condition = builder.toWhere({
    tableName: 'operator_sql_fixture',
    schema: table,
    where,
  }) as SQL;

  return dialect.sqlToQuery(condition);
};

describe('PostgresQueryOperators - the handlers Postgres keeps', () => {
  test('ilike is ILIKE and nilike is its negation', () => {
    expect(compile({ title: { ilike: '%a%' } })).toMatchObject({
      sql: '"operator_sql_fixture"."title" ilike $1',
      params: ['%a%'],
    });
    expect(compile({ title: { nilike: '%a%' } })).toMatchObject({
      sql: 'not "operator_sql_fixture"."title" ilike $1',
      params: ['%a%'],
    });
  });

  test('regexp is ~ and iregexp is ~*, with the pattern bound', () => {
    expect(compile({ title: { regexp: '^a' } })).toMatchObject({
      sql: '"operator_sql_fixture"."title" ~ $1',
      params: ['^a'],
    });
    expect(compile({ title: { iregexp: '^a' } })).toMatchObject({
      sql: '"operator_sql_fixture"."title" ~* $1',
      params: ['^a'],
    });
  });
});

describe('PostgresQueryOperators - the between message', () => {
  test('names the Postgres operator class and the operator, with the value', () => {
    expect(() => compile({ score: { between: [1] } })).toThrow(
      '[PostgresQueryOperators][BETWEEN] Invalid value: expected array of 2 elements, got [1]',
    );
    expect(() => compile({ score: { notBetween: 5 } })).toThrow(
      '[PostgresQueryOperators][NOT_BETWEEN] Invalid value: expected array of 2 elements, got 5',
    );
  });
});
