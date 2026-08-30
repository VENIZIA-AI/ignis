import { describe, test, expect } from 'bun:test';
import type { TWhere } from '@venizia/ignis-filter';

/**
 * Compile-time proof for `TWhere<T>`: a typo'd column or a wrong value type must fail `tsc`,
 * not silently compile into a filter that matches zero rows. Each `@ts-expect-error` is
 * load-bearing - removing it must make `tsc` report a real error on that line.
 */
describe('TWhere<T> compile-time type safety', () => {
  type TestRow = {
    id: number;
    status: string;
    price: number | null;
    deletedAt: Date | string | null;
    tags: string[];
  };

  test('rejects a mistyped column name', () => {
    // @ts-expect-error 'stat' is not a key of TestRow - the real column is 'status'.
    const where: TWhere<TestRow> = { stat: 'active' };
    expect(where).toBeDefined();
  });

  test('rejects a value of the wrong type for a known column', () => {
    // @ts-expect-error 'status' is a string column, not a number.
    const where: TWhere<TestRow> = { status: 123 };
    expect(where).toBeDefined();
  });

  test('rejects a between tuple with the wrong arity', () => {
    // @ts-expect-error 'between' is a [min, max] tuple, not three elements.
    const where: TWhere<TestRow> = { price: { between: [10, 20, 30] } };
    expect(where).toBeDefined();
  });

  test('accepts a bare scalar as an implicit eq', () => {
    const where: TWhere<TestRow> = { status: 'active' };
    expect(where.status).toBe('active');
  });

  test('accepts a bare null as an implicit is', () => {
    const where: TWhere<TestRow> = { deletedAt: null };
    expect(where.deletedAt).toBeNull();
  });

  test('accepts an operator object', () => {
    const where: TWhere<TestRow> = { price: { gte: 10, lte: 100 } };
    expect(where.price).toMatchObject({ gte: 10, lte: 100 });
  });

  test('accepts a bare array for an array-typed column', () => {
    const where: TWhere<TestRow> = { tags: ['a', 'b'] };
    expect(where.tags).toEqual(['a', 'b']);
  });

  test('accepts nested and/or', () => {
    const where: TWhere<TestRow> = {
      and: [{ status: 'active' }, { or: [{ price: { gte: 10 } }, { price: { lte: 5 } }] }],
    };
    expect(where.and).toHaveLength(2);
  });
});
