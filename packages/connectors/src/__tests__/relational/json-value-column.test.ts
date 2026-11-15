import { describe, expect, test } from 'bun:test';
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

  test('a default of any JSON shape is accepted, and an interface value must be spread', () => {
    PostgresDataTypeEnricher.generateColumnDefs({ defaultValue: { jValue: [] } });
    PostgresDataTypeEnricher.generateColumnDefs({ defaultValue: { jValue: { limit: 3 } } });
    PostgresDataTypeEnricher.generateColumnDefs({ defaultValue: { jValue: 'none' } });
    SqliteDataTypeEnricher.generateColumnDefs({ defaultValue: { jValue: [1, 2] } });
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
