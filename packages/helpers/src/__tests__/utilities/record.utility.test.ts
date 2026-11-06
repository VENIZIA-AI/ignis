import { describe, expect, test } from 'bun:test';
import { RecordUtility } from '@/utilities/record.utility';

const PRIMITIVES: unknown[] = [null, undefined, 0, 1, '', 'a', true, false, 1n, Symbol('s')];

describe('RecordUtility.isRecord', () => {
  test('accepts a plain object, an empty object and a null-prototype object', () => {
    expect(RecordUtility.isRecord({ a: 1 })).toBe(true);
    expect(RecordUtility.isRecord({})).toBe(true);
    expect(RecordUtility.isRecord(Object.create(null))).toBe(true);
  });

  test('accepts a class instance and an array', () => {
    expect(RecordUtility.isRecord(new Error('boom'))).toBe(true);
    expect(RecordUtility.isRecord(new Date())).toBe(true);
    expect(RecordUtility.isRecord([])).toBe(true);
    expect(RecordUtility.isRecord([{ a: 1 }])).toBe(true);
  });

  test('rejects null, undefined, every primitive and a function', () => {
    for (const value of [...PRIMITIVES, () => ({})]) {
      expect(RecordUtility.isRecord(value)).toBe(false);
    }
  });

  test('works as a filter callback', () => {
    const rows: unknown[] = [{ id: 1 }, [1], null, 'x'];

    expect(rows.filter(RecordUtility.isRecord)).toHaveLength(2);
  });
});

describe('RecordUtility.isPlainRecord', () => {
  test('accepts a plain object, an empty object, a null-prototype object and a class instance', () => {
    expect(RecordUtility.isPlainRecord({ a: 1 })).toBe(true);
    expect(RecordUtility.isPlainRecord({})).toBe(true);
    expect(RecordUtility.isPlainRecord(Object.create(null))).toBe(true);
    expect(RecordUtility.isPlainRecord(new Error('boom'))).toBe(true);
  });

  test('rejects an array, including an empty one', () => {
    expect(RecordUtility.isPlainRecord([])).toBe(false);
    expect(RecordUtility.isPlainRecord([{ a: 1 }])).toBe(false);
  });

  test('rejects null, undefined, every primitive and a function', () => {
    for (const value of [...PRIMITIVES, () => ({})]) {
      expect(RecordUtility.isPlainRecord(value)).toBe(false);
    }
  });

  test('narrows the type and works as a filter callback', () => {
    const rows: unknown[] = [{ id: 1 }, [1], null, 'x', { id: 2 }];
    const records = rows.filter(RecordUtility.isPlainRecord);

    expect(records).toEqual([{ id: 1 }, { id: 2 }]);
    expect(records[0]?.['id']).toBe(1);
  });
});
