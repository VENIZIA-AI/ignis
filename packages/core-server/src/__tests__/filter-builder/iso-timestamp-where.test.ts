import { describe, test, expect } from 'bun:test';
import { pgTable, serial, text } from 'drizzle-orm/pg-core';
import { PgDialect } from 'drizzle-orm/pg-core';
import { sqliteTable, integer } from 'drizzle-orm/sqlite-core';
import type { TWhere } from '@venizia/ignis-filter';
import { PostgresFilterBuilder, isoTimestamp } from '@venizia/ignis-connectors/postgres';
import { isoTimestamp as sqliteIsoTimestamp } from '@venizia/ignis-connectors/sqlite';

/**
 * `isoTimestamp` brands its column's read/insert shape with `TIsoTimestamp` (see
 * `packages/filter/src/common/types.ts`), so `TWhereValue` can admit a `Date` for that column
 * only - its `toDriver` already converts one. A plain `text` column carries no such brand and
 * comparing it against a `Date` must stay a compile error. Each `@ts-expect-error` is
 * load-bearing - removing it must make `tsc` report a real error on that line.
 */
describe('TWhere<T> - isoTimestamp columns admit a Date, plain text columns do not', () => {
  const table = pgTable('events', {
    id: serial('id').primaryKey(),
    effectiveFrom: isoTimestamp('effective_from').notNull(),
    effectiveTo: isoTimestamp('effective_to'),
    plainText: text('plain_text').notNull(),
  });

  type EventRow = typeof table.$inferSelect;

  test('accepts a Date inside an operator object on an isoTimestamp column', () => {
    const where: TWhere<EventRow> = { effectiveFrom: { lte: new Date() } };
    expect(where.effectiveFrom).toMatchObject({ lte: expect.any(Date) });
  });

  test('accepts a bare Date scalar on an isoTimestamp column', () => {
    const where: TWhere<EventRow> = { effectiveFrom: new Date() };
    expect(where.effectiveFrom).toBeInstanceOf(Date);
  });

  test('a string still works on an isoTimestamp column', () => {
    const where: TWhere<EventRow> = { effectiveFrom: '2026-01-01T00:00:00.000Z' };
    expect(where.effectiveFrom).toBe('2026-01-01T00:00:00.000Z');
  });

  test('accepts null on a nullable isoTimestamp column', () => {
    const where: TWhere<EventRow> = { effectiveTo: null };
    expect(where.effectiveTo).toBeNull();
  });

  test('rejects a bare Date scalar on a plain text column', () => {
    // @ts-expect-error 'plainText' is a text column, not an isoTimestamp - a Date is not valid here.
    const where: TWhere<EventRow> = { plainText: new Date() };
    expect(where).toBeDefined();
  });

  test('rejects a Date inside an operator object on a plain text column', () => {
    // @ts-expect-error same column, inside an operator - the brand does not reach it either.
    const where: TWhere<EventRow> = { plainText: { lte: new Date() } };
    expect(where).toBeDefined();
  });

  test('the generated SQL for a Date and for its .toISOString() are identical', () => {
    const filterBuilder = new PostgresFilterBuilder();
    const dialect = new PgDialect();
    const someDate = new Date('2026-01-01T00:00:00.000Z');

    const conditionWithDate = filterBuilder.toWhere({
      tableName: 'events',
      schema: table,
      where: { effectiveFrom: { lte: someDate } },
    });
    const conditionWithIsoString = filterBuilder.toWhere({
      tableName: 'events',
      schema: table,
      where: { effectiveFrom: { lte: someDate.toISOString() } },
    });

    const queryWithDate = dialect.sqlToQuery(conditionWithDate!);
    const queryWithIsoString = dialect.sqlToQuery(conditionWithIsoString!);

    expect(queryWithDate.sql).toBe(queryWithIsoString.sql);
    expect(queryWithDate.params).toEqual(queryWithIsoString.params);
  });

  test('$inferInsert still accepts a plain string for an isoTimestamp column', () => {
    type EventInsert = typeof table.$inferInsert;
    const insertValue: EventInsert = {
      effectiveFrom: '2026-01-01T00:00:00.000Z',
      plainText: 'unchanged',
    };
    expect(insertValue.effectiveFrom).toBe('2026-01-01T00:00:00.000Z');
  });

  test('SQLite isoTimestamp carries the same brand', () => {
    const sqliteTableWithTimestamp = sqliteTable('sqlite_events', {
      id: integer('id').primaryKey(),
      effectiveFrom: sqliteIsoTimestamp('effective_from').notNull(),
    });
    type SqliteEventRow = typeof sqliteTableWithTimestamp.$inferSelect;

    const where: TWhere<SqliteEventRow> = { effectiveFrom: { gte: new Date() } };
    expect(where.effectiveFrom).toMatchObject({ gte: expect.any(Date) });
    expect(sqliteTableWithTimestamp.effectiveFrom.getSQLType()).toBe('text');
  });
});
