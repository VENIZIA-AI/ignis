import { describe, test, expect } from 'bun:test';
import { pgTable, serial, integer } from 'drizzle-orm/pg-core';
import { ApplicationError } from '@venizia/ignis-helpers/core';

import { PostgresFilterBuilder } from '@/connectors/postgres/repositories/dialect';

describe('PostgresQueryOperators.FNS - between/notBetween invalid-value errors', () => {
  const table = pgTable('items', {
    id: serial('id').primaryKey(),
    price: integer('price'),
  });

  const filterBuilder = new PostgresFilterBuilder();

  test('between with a single-element array throws an ApplicationError naming [PostgresQueryOperators][BETWEEN]', () => {
    let caught: unknown;

    try {
      filterBuilder.toWhere({
        tableName: 'items',
        schema: table,
        where: { price: { between: [10] } },
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ApplicationError);
    expect((caught as ApplicationError).message).toMatch(/\[PostgresQueryOperators\]\[BETWEEN\]/);
  });

  test('notBetween with a 3-element array throws an ApplicationError naming [PostgresQueryOperators][NOT_BETWEEN]', () => {
    let caught: unknown;

    try {
      filterBuilder.toWhere({
        tableName: 'items',
        schema: table,
        where: { price: { notBetween: [10, 20, 30] } },
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ApplicationError);
    expect((caught as ApplicationError).message).toMatch(
      /\[PostgresQueryOperators\]\[NOT_BETWEEN\]/,
    );
  });

  test('a valid [min, max] tuple still builds the condition without throwing', () => {
    expect(() =>
      filterBuilder.toWhere({
        tableName: 'items',
        schema: table,
        where: { price: { between: [10, 20] } },
      }),
    ).not.toThrow();
  });
});
