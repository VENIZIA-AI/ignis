import { describe, expect, test } from 'bun:test';
import { FilterKeys } from '@/common/keys';

/** One reader of a filter key: the query and the request guard both use it, so they cannot read a key differently. */

describe('FilterKeys.columnOf', () => {
  test.each([
    ['a plain name', 'meta', 'meta'],
    ['a dotted path', 'meta.pin', 'meta'],
    ['a bracketed path', '[meta].pin', 'meta'],
    ['a leading dot', '.meta.pin', 'meta'],
    ['a bracket glued to a name', '[meta]pin', 'meta'],
    ['an index', 'meta[0]', 'meta'],
    ['a leading dot on one name', '.secret', 'secret'],
    ['a bracketed name alone', '[secret]', 'secret'],
  ])('%s names its first part', (_name, key, column) => {
    expect(FilterKeys.columnOf({ key })).toBe(column);
  });

  test('a key with no part falls back to the key itself', () => {
    expect(FilterKeys.columnOf({ key: '.' })).toBe('.');
  });
});

describe('FilterKeys.isJsonPath and parseJsonPath', () => {
  test('a dot or a bracket makes a path, and the path is what follows the column', () => {
    expect(FilterKeys.isJsonPath({ key: 'meta' })).toBe(false);
    expect(FilterKeys.isJsonPath({ key: 'meta.pin' })).toBe(true);
    expect(FilterKeys.isJsonPath({ key: '[meta]' })).toBe(true);
    expect(FilterKeys.parseJsonPath({ key: 'meta.a[0].b' })).toEqual({
      columnName: 'meta',
      path: ['a', '0', 'b'],
    });
  });
});
