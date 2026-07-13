import { describe, expect, test } from 'bun:test';
import type { SQL } from 'drizzle-orm';
import { jsonb, PgDialect, pgTable, serial } from 'drizzle-orm/pg-core';
import type { AnyType } from '@venizia/ignis-helpers';
import { FilterBuilder } from '@/connectors/postgres/repositories/dialect/filter';

/**
 * A JSON `#>>` extraction is TEXT. Comparing it to a number needs a numeric cast, or Postgres raises
 * `operator does not exist: text > integer` at runtime.
 *
 * The cast was chosen once for the WHOLE operator object, which breaks two ways: a `not` wrapper
 * hides its numeric operand from the check, and a mixed object (`{ gte: 1, like: '%a%' }`) casts the
 * extraction for the `like` too. The choice belongs to each OPERATOR, not to the object.
 */
const table = pgTable('documents', {
  id: serial('id').primaryKey(),
  metadata: jsonb('metadata'),
});

const dialect = new PgDialect();

const compile = (where: AnyType): string => {
  const builder = new FilterBuilder() as AnyType;
  const condition = builder.toWhere({ tableName: 'documents', schema: table, where }) as SQL;

  return dialect.sqlToQuery(condition).sql;
};

/** The numeric cast is the CASE expression; its presence is what tells the two paths apart. */
const isNumericCast = (statement: string) => statement.includes('::numeric');

describe('a numeric operand gets the numeric cast', () => {
  test('gt', () => {
    expect(isNumericCast(compile({ 'metadata.score': { gt: 50 } }))).toBe(true);
  });

  test('inq of numbers', () => {
    expect(isNumericCast(compile({ 'metadata.score': { inq: [1, 2] } }))).toBe(true);
  });
});

describe('a NESTED not must not hide its numeric operand', () => {
  test('not: { gt } casts - without it Postgres raises `text > integer`', () => {
    const statement = compile({ 'metadata.score': { not: { gt: 50 } } });

    expect(isNumericCast(statement)).toBe(true);
    expect(statement.toLowerCase()).toContain('not');
  });

  test('not: { eq: number } casts', () => {
    expect(isNumericCast(compile({ 'metadata.score': { not: { eq: 5 } } }))).toBe(true);
  });

  test('not: { inq: [numbers] } casts', () => {
    expect(isNumericCast(compile({ 'metadata.score': { not: { inq: [1, 2] } } }))).toBe(true);
  });

  test('not: { like } does NOT cast - a text operator needs the text extraction', () => {
    expect(isNumericCast(compile({ 'metadata.title': { not: { like: '%a%' } } }))).toBe(false);
  });
});

describe('a MIXED operator object casts per operator, not per object', () => {
  test('{ gte: number, like: text } gives the numeric side a cast and the text side none', () => {
    // Casting the whole extraction produced `numeric ~~ text`, which Postgres rejects outright.
    // Asserting merely that `#>>` appears proves nothing - the CASE expression CONTAINS `#>>`.
    // What matters is that `like` is NOT applied to the CASE, i.e. never preceded by its `END`.
    const statement = compile({ 'metadata.score': { gte: 1, like: '%a%' } });

    expect(statement).toContain('::numeric');
    expect(statement.toLowerCase()).not.toContain('end like');
    expect(statement.toLowerCase()).toContain("#>> '{score}' like");
  });
});

describe('a text operand keeps the text extraction', () => {
  test('like', () => {
    expect(isNumericCast(compile({ 'metadata.title': { like: '%a%' } }))).toBe(false);
  });

  test('eq of a string', () => {
    expect(isNumericCast(compile({ 'metadata.title': { eq: 'x' } }))).toBe(false);
  });
});
