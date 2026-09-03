import { describe, expect, test } from 'bun:test';
import { readAffectedRowCount, readResultRows } from '@/utilities';

/** Drizzle's raw result shape differs per driver (pg `{ rows, rowCount }` vs postgres-js array with `count`) and the shared `PgDatabase` type cannot tell them apart - these two readers are the only place that knows. An unrecognized shape THROWS: returning `0`/`[]` would be silently wrong. */
describe('readAffectedRowCount', () => {
  test('reads pg.QueryResult.rowCount (node-postgres)', () => {
    expect(readAffectedRowCount({ result: { rowCount: 3, rows: [] } })).toBe(3);
  });

  test('reads RowList.count (postgres-js)', () => {
    const rowList = Object.assign([], { count: 5, command: 'UPDATE' });
    expect(readAffectedRowCount({ result: rowList })).toBe(5);
  });

  test('rowCount wins when both are present', () => {
    expect(readAffectedRowCount({ result: { rowCount: 2, count: 9 } })).toBe(2);
  });

  test('a zero rowCount is preserved, not coerced away', () => {
    expect(readAffectedRowCount({ result: { rowCount: 0 } })).toBe(0);
  });

  test('pg reports rowCount: null for statements that affect no rows', () => {
    expect(readAffectedRowCount({ result: { rowCount: null } })).toBe(0);
  });

  test('null and undefined resolve to 0 - drizzle resolves some statements to nothing', () => {
    expect(readAffectedRowCount({ result: null })).toBe(0);
    expect(readAffectedRowCount({ result: undefined })).toBe(0);
  });

  test('a primitive throws rather than reporting zero rows affected', () => {
    expect(() => readAffectedRowCount({ result: 7 })).toThrow(/Unrecognized driver result/);
  });

  test('an object with neither rowCount nor count throws', () => {
    // `0` is a legitimate answer, so it must never double as "I did not understand this".
    expect(() => readAffectedRowCount({ result: { command: 'INSERT' } })).toThrow(
      /Unrecognized driver result/,
    );
  });
});

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
