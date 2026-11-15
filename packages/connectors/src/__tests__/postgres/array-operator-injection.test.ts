import { describe, expect, test } from 'bun:test';
import { pgTable, serial, text } from 'drizzle-orm/pg-core';
import { PostgresQueryOperators } from '@/relational/postgres/repositories/dialect/query';

/** `contains`/`containedBy`/`overlaps` are wire-reachable with a `z.any()` operand, so these handlers must build PARAMETERIZED SQL - a concatenated value lets the caller write SQL. */
const table = pgTable('articles', {
  id: serial('id').primaryKey(),
  tags: text('tags').array(),
});

/** A named member of a chunk the fragment carries, or `undefined` for a chunk that is not an object (a bare parameter value). */
const readMember = (chunk: unknown, name: string): unknown =>
  typeof chunk === 'object' && chunk !== null ? Reflect.get(chunk, name) : undefined;

/** Renders a Drizzle SQL fragment into `{ sql, params }` exactly as the driver would receive it. */
const render = (fragment: unknown): { sql: string; params: unknown[] } => {
  const getSql = readMember(fragment, 'getSQL');
  const query: unknown =
    typeof getSql === 'function' ? Reflect.apply(getSql, fragment, []) : fragment;
  const chunks = readMember(query, 'queryChunks');

  if (!Array.isArray(chunks)) {
    throw new Error('[render] The fragment carries no queryChunks');
  }

  let statement = '';
  const params: unknown[] = [];

  for (const chunk of chunks) {
    const value = readMember(chunk, 'value');
    const name = readMember(chunk, 'name');

    if (value !== undefined && Array.isArray(value)) {
      statement += value.join('');
      continue;
    }

    if (name !== undefined && readMember(chunk, 'columnType') !== undefined) {
      statement += `"${String(name)}"`;
      continue;
    }

    if (readMember(chunk, 'queryChunks')) {
      const nested = render(chunk);
      statement += nested.sql;
      params.push(...nested.params);
      continue;
    }

    statement += '?';
    params.push(value ?? chunk);
  }

  return { sql: statement, params };
};

type TArrayOperator = 'contains' | 'containedBy' | 'overlaps';

const applyOperator = (operator: TArrayOperator, value: unknown) => {
  const handler = PostgresQueryOperators.FNS[operator];

  return handler({ column: table.tags, value });
};

describe('array operators - the operand must never reach the statement text', () => {
  const injection = '1); DROP TABLE users; --';

  const operators: TArrayOperator[] = ['contains', 'containedBy', 'overlaps'];

  for (const operator of operators) {
    test(`${operator}: a NUMERIC-looking array carrying a SQL payload is parameterized, not concatenated`, () => {
      // The array type is sniffed from element[0], so a leading number used to select the "safe to interpolate" branch and every later element was join()-ed in raw.
      const { sql: statement, params } = render(applyOperator(operator, [1, injection]));

      expect(statement).not.toContain('DROP TABLE');
      expect(params).toContain(injection);
    });

    test(`${operator}: a BOOLEAN-looking array is parameterized too`, () => {
      const { sql: statement, params } = render(applyOperator(operator, [true, injection]));

      expect(statement).not.toContain('DROP TABLE');
      expect(params).toContain(injection);
    });

    test(`${operator}: a string array is parameterized (never hand-escaped)`, () => {
      const { sql: statement, params } = render(applyOperator(operator, ["o'brien", injection]));

      expect(statement).not.toContain('DROP TABLE');
      expect(statement).not.toContain("o'brien");
      expect(params).toContain(injection);
    });
  }

  test('the column reaches the statement as an identifier, and the values do not', () => {
    const { sql: statement, params } = render(applyOperator('overlaps', ['a', 'b']));

    expect(statement).toContain('"tags"');
    expect(params).toEqual(expect.arrayContaining(['a', 'b']));
  });
});
