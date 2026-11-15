import { describe, expect, test } from 'bun:test';
import type { TJsonColumnKey, TWhere } from '@venizia/ignis-filter';
import type { TJsonValue } from '@venizia/ignis-helpers/common';
import { pgTable } from 'drizzle-orm/pg-core';
import { sqliteTable } from 'drizzle-orm/sqlite-core';
import { PostgresDataTypeEnricher } from '@/relational/postgres/models';
import { SqliteDataTypeEnricher } from '@/relational/sqlite/models';

/** Each side is assignable to the other: the strict identity check cannot compare a recursive alias with its expansion. */
type TEqual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

/** Fails to compile unless `Condition` is `true`. */
const assertType = <Condition extends true>(): Condition | undefined => undefined;

const postgresTable = pgTable('json_values_pg', {
  ...PostgresDataTypeEnricher.generateColumnDefs(),
});
const sqliteTableDef = sqliteTable('json_values_sqlite', {
  ...SqliteDataTypeEnricher.generateColumnDefs(),
});

type TPostgresRow = typeof postgresTable.$inferSelect;
type TPostgresInsert = typeof postgresTable.$inferInsert;
type TSqliteRow = typeof sqliteTableDef.$inferSelect;
type TSqliteInsert = typeof sqliteTableDef.$inferInsert;

describe('the jValue column holds any JSON value, on both dialects', () => {
  test('the column is a TJsonValue or null on read, and takes every TJsonValue on insert', () => {
    assertType<TEqual<TPostgresRow['jValue'], TJsonValue | null>>();
    assertType<TEqual<TSqliteRow['jValue'], TJsonValue | null>>();
    assertType<[TJsonValue] extends [TPostgresInsert['jValue']] ? true : false>();
    assertType<[TJsonValue] extends [TSqliteInsert['jValue']] ? true : false>();

    expect(true).toBe(true);
  });

  test('an array, a record, a nested value and a scalar are assignable', () => {
    const accounts: TJsonValue = [{ name: 'root' }, { name: 'guest' }];
    const rows: (TPostgresInsert | TSqliteInsert)[] = [
      { jValue: accounts },
      { jValue: { darkMode: true, tags: ['a', 'b'], nested: { depth: [1, [2, 3]] } } },
      { jValue: 'text' },
      { jValue: 3 },
      { jValue: false },
      { jValue: null },
      { jValue: [] },
    ];

    expect(rows).toHaveLength(7);
  });

  test('a function, a Date and an undefined member are refused', () => {
    // @ts-expect-error a function is not JSON
    const refusedFunction: TPostgresInsert = { jValue: () => 1 };
    // @ts-expect-error a Date is not JSON: send its ISO string
    const refusedDate: TSqliteInsert = { jValue: new Date() };
    // @ts-expect-error undefined inside a record is not JSON
    const refusedUndefined: TPostgresInsert = { jValue: { a: undefined } };

    expect([refusedFunction, refusedDate, refusedUndefined]).toHaveLength(3);
  });

  test('jValue stays a JSON-path column: its keys and a where on a path compile, a text column still refuses them', () => {
    assertType<TEqual<Extract<TJsonColumnKey<TPostgresRow>, 'jValue'>, 'jValue'>>();

    const where: TWhere<TPostgresRow> = { 'jValue.a.b': 'x', 'jValue.tags[0]': { eq: 'a' } };
    // @ts-expect-error a text column takes no JSON path
    const refused: TWhere<TPostgresRow> = { 'tValue.label': 'x' };

    expect([where, refused]).toHaveLength(2);
  });

  test('a readonly array and an as const value are refused: copy them', () => {
    const list = ['a', 'b'] as const;
    // @ts-expect-error a readonly array is not assignable to a mutable JSON array
    const refused: TPostgresInsert = { jValue: list };
    const copied: TPostgresInsert = { jValue: [...list] };

    expect([refused, copied]).toHaveLength(2);
  });

  test('a default is an array or a record, and an interface value must be spread', () => {
    PostgresDataTypeEnricher.generateColumnDefs({ defaultValue: { jValue: [] } });
    PostgresDataTypeEnricher.generateColumnDefs({ defaultValue: { jValue: { limit: 3 } } });
    SqliteDataTypeEnricher.generateColumnDefs({ defaultValue: { jValue: [1, 2] } });
    // @ts-expect-error a scalar default is refused: drizzle-kit writes it unencoded, which is not valid JSON in SQL
    PostgresDataTypeEnricher.generateColumnDefs({ defaultValue: { jValue: 'none' } });
    // @ts-expect-error same for SQLite, where `true` would read back as 1
    SqliteDataTypeEnricher.generateColumnDefs({ defaultValue: { jValue: true } });
    SqliteDataTypeEnricher.generateColumnDefs({ defaultValue: { jValue: { limit: 3 } } });

    interface IMeta {
      label: string;
    }
    const meta: IMeta = { label: 'x' };
    // @ts-expect-error an interface has no index signature: spread it, or declare it as a type
    const refused: TPostgresInsert = { jValue: meta };
    const spread: TPostgresInsert = { jValue: { ...meta } };

    expect([refused, spread]).toHaveLength(2);
  });
});
