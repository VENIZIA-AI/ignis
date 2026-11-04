import { describe, expect, test } from 'bun:test';
import { ScopeOperations, type TScopeOperation, type TScopeOperationGroup } from '@/index';

const OPERATIONS = ['read', 'create', 'update', 'delete'] as const;
const GROUPS = ['write', 'all'] as const;
const SIX = [...OPERATIONS, ...GROUPS];

describe('ScopeOperations', () => {
  test('holds the four concrete operations and the two groups', () => {
    expect(ScopeOperations.READ).toBe('read');
    expect(ScopeOperations.CREATE).toBe('create');
    expect(ScopeOperations.UPDATE).toBe('update');
    expect(ScopeOperations.DELETE).toBe('delete');
    expect(ScopeOperations.WRITE).toBe('write');
    expect(ScopeOperations.ALL).toBe('all');
  });

  test('SCHEME_SET holds all six values, OPERATION_SET only the concrete ones', () => {
    expect([...ScopeOperations.SCHEME_SET]).toEqual(SIX);
    expect([...ScopeOperations.OPERATION_SET]).toEqual([...OPERATIONS]);
  });

  test('GROUP_MAP maps WRITE to the three writes and ALL to every concrete operation', () => {
    expect([...(ScopeOperations.GROUP_MAP.get(ScopeOperations.WRITE) ?? [])]).toEqual([
      'create',
      'update',
      'delete',
    ]);
    expect([...(ScopeOperations.GROUP_MAP.get(ScopeOperations.ALL) ?? [])]).toEqual([
      ...OPERATIONS,
    ]);
    expect(ScopeOperations.GROUP_MAP.size).toBe(2);
  });

  test('isValid accepts each of the six values and nothing else', () => {
    for (const value of SIX) {
      expect(ScopeOperations.isValid(value)).toBe(true);
    }

    expect(ScopeOperations.isValid('nope')).toBe(false);
    expect(ScopeOperations.isValid('')).toBe(false);
    expect(ScopeOperations.isValid('READ')).toBe(false);
  });

  test('includes: a concrete operation includes itself and nothing else', () => {
    for (const group of OPERATIONS) {
      for (const operation of OPERATIONS) {
        expect(ScopeOperations.includes({ group, operation })).toBe(group === operation);
      }
    }
  });

  test('includes: WRITE holds the three writes and not READ', () => {
    const expected: Record<TScopeOperation, boolean> = {
      read: false,
      create: true,
      update: true,
      delete: true,
    };

    for (const operation of OPERATIONS) {
      expect(ScopeOperations.includes({ group: ScopeOperations.WRITE, operation })).toBe(
        expected[operation],
      );
    }
  });

  test('includes: ALL holds every concrete operation', () => {
    for (const operation of OPERATIONS) {
      expect(ScopeOperations.includes({ group: ScopeOperations.ALL, operation })).toBe(true);
    }
  });

  test('includes: every pair of the six values answers without throwing', () => {
    for (const group of SIX) {
      for (const operation of OPERATIONS) {
        expect(typeof ScopeOperations.includes({ group, operation })).toBe('boolean');
      }
    }
  });

  test('the types: TScopeOperation is the four concrete values, TScopeOperationGroup all six', () => {
    const concrete: TScopeOperation[] = ['read', 'create', 'update', 'delete'];
    const group: TScopeOperationGroup[] = [...concrete, 'write', 'all'];

    // @ts-expect-error - a group is not a concrete operation
    const notConcrete: TScopeOperation = 'write';

    expect(concrete).toHaveLength(4);
    expect(group).toHaveLength(6);
    expect(String(notConcrete)).toBe('write');
  });
});
