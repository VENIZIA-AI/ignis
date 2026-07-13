import { describe, expect, test } from 'bun:test';
import { pgTable, serial, text } from 'drizzle-orm/pg-core';
import type { AnyType } from '@venizia/ignis-helpers';
import { PostgresQueryOperators } from '@/connectors/postgres/repositories/dialect/query';

/**
 * `contains` / `containedBy` / `overlaps` are reachable straight from the wire: a REST caller sends
 * `?filter={"where":{"tags":{"overlaps":[...]}}}`, and the operand is typed `z.any()` all the way
 * down. Whatever these handlers build must therefore be PARAMETERIZED - the moment a value is
 * concatenated into the statement, the caller is writing SQL.
 */
const table = pgTable('articles', {
  id: serial('id').primaryKey(),
  tags: text('tags').array(),
});

/** Renders a Drizzle SQL fragment into `{ sql, params }` exactly as the driver would receive it. */
const render = (fragment: AnyType): { sql: string; params: unknown[] } => {
  const query = (fragment as AnyType).getSQL
    ? (fragment as AnyType).getSQL()
    : (fragment as AnyType);
  const chunks = query.queryChunks as AnyType[];

  let statement = '';
  const params: unknown[] = [];

  for (const chunk of chunks) {
    if (chunk?.value !== undefined && Array.isArray(chunk.value)) {
      statement += chunk.value.join('');
      continue;
    }

    if (chunk?.name !== undefined && chunk?.columnType !== undefined) {
      statement += `"${chunk.name}"`;
      continue;
    }

    if (chunk?.queryChunks) {
      const nested = render(chunk);
      statement += nested.sql;
      params.push(...nested.params);
      continue;
    }

    statement += '?';
    params.push(chunk?.value ?? chunk);
  }

  return { sql: statement, params };
};

const applyOperator = (operator: string, value: unknown) => {
  const handler = (PostgresQueryOperators.FNS as AnyType)[operator];
  return handler({ column: table.tags, value });
};

describe('array operators - the operand must never reach the statement text', () => {
  const injection = '1); DROP TABLE users; --';

  for (const operator of ['contains', 'containedBy', 'overlaps']) {
    test(`${operator}: a NUMERIC-looking array carrying a SQL payload is parameterized, not concatenated`, () => {
      // The type of the array is sniffed from element[0]. A leading number used to select the
      // "safe to interpolate" branch, and every later element was join()-ed in raw.
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
