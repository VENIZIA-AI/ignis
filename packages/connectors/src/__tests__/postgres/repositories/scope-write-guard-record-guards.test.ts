import { describe, expect, test } from 'bun:test';
import { ScopeOperations } from '@venizia/ignis-kernel';
import { ScopeWriteGuard } from '@/relational/core/repositories/common/scope-write-guard';

/**
 * `ScopeWriteGuard` reads a scope with `RecordUtility.isPlainRecord`, which refuses an array, where the search
 * connectors read a payload with `isRecord`, which accepts one. These cases pin the write-guard side.
 */
const narrow = (scopeWhere: Record<string, unknown>) => {
  return ScopeWriteGuard.mutationWhere({
    settings: {},
    model: 'items',
    operation: ScopeOperations.UPDATE,
    scopeWhere,
  });
};

describe('ScopeWriteGuard reads a scope with isPlainRecord', () => {
  test('an array standing where an `and` part belongs is read as an empty part, not as a record', () => {
    expect(narrow({ and: [[{ merchantId: 'm-a' }], { merchantId: 'm-a' }] })).toEqual(
      narrow({ and: [{}, { merchantId: 'm-a' }] }),
    );
  });

  test('a record part is still narrowed', () => {
    expect(narrow({ and: [{ merchantId: { inq: ['m-a', null] } }] })).toEqual({
      and: [{ merchantId: { inq: ['m-a'] } }],
    });
  });

  test('an array condition value is read as a list of values', () => {
    expect(narrow({ merchantId: ['m-a', null] })).toEqual({ merchantId: ['m-a'] });
  });
});
