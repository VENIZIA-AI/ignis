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

describe('RecordUtility.read', () => {
  const payload = {
    user: { name: 'Ada', tags: ['a', 'b'], nested: [{ id: 7 }] },
    empty: null,
    zero: 0,
  };

  test('reads a nested value along the path', () => {
    expect(RecordUtility.read({ value: payload, path: ['user', 'name'] })).toBe('Ada');
    expect(RecordUtility.read({ value: payload, path: ['zero'] })).toBe(0);
  });

  test('an empty path answers the value itself', () => {
    expect(RecordUtility.read({ value: payload, path: [] })).toBe(payload);
    expect(RecordUtility.read({ value: 5, path: [] })).toBe(5);
  });

  test('reads through arrays by index, as a number or a string', () => {
    expect(RecordUtility.read({ value: payload, path: ['user', 'tags', 1] })).toBe('b');
    expect(RecordUtility.read({ value: payload, path: ['user', 'tags', '0'] })).toBe('a');
    expect(RecordUtility.read({ value: payload, path: ['user', 'nested', 0, 'id'] })).toBe(7);
    expect(RecordUtility.read({ value: payload, path: ['user', 'tags', 9] })).toBeUndefined();
  });

  test('a missing step answers undefined', () => {
    expect(RecordUtility.read({ value: payload, path: ['user', 'age'] })).toBeUndefined();
    expect(RecordUtility.read({ value: payload, path: ['nobody', 'name'] })).toBeUndefined();
  });

  test('a null step answers undefined, where getDeepProperty would throw', () => {
    expect(RecordUtility.read({ value: payload, path: ['empty', 'x'] })).toBeUndefined();
    expect(RecordUtility.read({ value: payload, path: ['empty'] })).toBeNull();
  });

  test('a step that is not an object answers undefined, a string length included', () => {
    expect(
      RecordUtility.read({ value: payload, path: ['user', 'name', 'length'] }),
    ).toBeUndefined();
    expect(RecordUtility.read({ value: payload, path: ['zero', 'toFixed'] })).toBeUndefined();
  });

  test('every non-object root answers undefined for a non-empty path', () => {
    for (const value of [...PRIMITIVES, () => ({ a: 1 })]) {
      expect(RecordUtility.read({ value, path: ['a'] })).toBeUndefined();
    }
  });

  test.each(['__proto__', 'constructor', 'prototype', 'toString', 'hasOwnProperty', 'valueOf'])(
    'the prototype name %p is never found through the prototype',
    (name) => {
      expect(RecordUtility.read({ value: {}, path: [name] })).toBeUndefined();
      expect(RecordUtility.read({ value: { a: {} }, path: ['a', name] })).toBeUndefined();
      expect(RecordUtility.read({ value: [], path: [name] })).toBeUndefined();
      expect(
        RecordUtility.read({ value: payload, path: ['user', 'constructor', 'name'] }),
      ).toBeUndefined();
    },
  );

  test('an own property that has a prototype name is read: it is the data, not the prototype', () => {
    const parsed = JSON.parse('{"__proto__": {"x": 1}, "constructor": 2}');

    expect(RecordUtility.read({ value: parsed, path: ['__proto__', 'x'] })).toBe(1);
    expect(RecordUtility.read({ value: parsed, path: ['constructor'] })).toBe(2);
    expect(({} as Record<string, unknown>).x).toBeUndefined();
  });

  test('a null-prototype object is read', () => {
    const bare = Object.assign(Object.create(null), { a: { b: 1 } });

    expect(RecordUtility.read({ value: bare, path: ['a', 'b'] })).toBe(1);
  });

  test('a path read twice does not change the value', () => {
    const before = JSON.stringify(payload);

    RecordUtility.read({ value: payload, path: ['user', 'tags', 0] });
    RecordUtility.read({ value: payload, path: ['__proto__', 'polluted'] });

    expect(JSON.stringify(payload)).toBe(before);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});
