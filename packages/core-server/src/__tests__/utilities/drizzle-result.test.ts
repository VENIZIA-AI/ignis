import { describe, expect, test } from 'bun:test';
import { readResultRows } from '@/utilities';

/** Drizzle's raw result shape differs per driver (pg `{ rows }` vs the postgres-js row list) and the shared `PgDatabase` type cannot tell them apart - this reader is the only place that knows. An unrecognized shape THROWS: returning `[]` would be silently wrong. */
describe('readResultRows', () => {
  interface IRow {
    id: number;
  }

  test('reads pg.QueryResult.rows (node-postgres)', () => {
    const result = { rows: [{ id: 1 }, { id: 2 }], rowCount: 2 };
    expect(readResultRows<IRow>({ result })).toEqual([{ id: 1 }, { id: 2 }]);
  });

  test('a RowList IS the rows (postgres-js)', () => {
    // postgres-js resolves to the array itself; it has no `.rows`.
    const rowList = Object.assign([{ id: 1 }, { id: 2 }], { count: 2 });
    expect(readResultRows<IRow>({ result: rowList })).toEqual([{ id: 1 }, { id: 2 }]);
  });

  test('an empty pg result yields an empty array', () => {
    expect(readResultRows<IRow>({ result: { rows: [], rowCount: 0 } })).toEqual([]);
  });

  test('an empty RowList yields an empty array', () => {
    expect(readResultRows<IRow>({ result: Object.assign([], { count: 0 }) })).toEqual([]);
  });

  test('null and undefined yield an empty array', () => {
    expect(readResultRows<IRow>({ result: null })).toEqual([]);
    expect(readResultRows<IRow>({ result: undefined })).toEqual([]);
  });

  test('an object without a rows array throws rather than loading zero rows', () => {
    // Silently returning [] here would deny every authorization decision with no error.
    expect(() => readResultRows<IRow>({ result: { command: 'SELECT' } })).toThrow(
      /Unrecognized driver result/,
    );
  });

  test('a non-array rows property throws', () => {
    expect(() => readResultRows<IRow>({ result: { rows: 'nope' } })).toThrow(
      /Unrecognized driver result/,
    );
  });

  test('a primitive throws', () => {
    expect(() => readResultRows<IRow>({ result: 7 })).toThrow(/Unrecognized driver result/);
  });
});
