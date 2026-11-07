import { describe, expect, test } from 'bun:test';
import { ScopeOperations, type IModelAccessSettings } from '@venizia/ignis-kernel';
import { ScopeWriteGuard } from '@/relational/core/repositories/common/scope-write-guard';

/**
 * The write guard runs for a write. A READ reaching it is a bug in the caller, not a request, so it
 * throws and never reads the scope.
 */
const settingsRecording = (opts: { calls: Array<unknown> }): IModelAccessSettings => {
  return {
    resolve: (context) => {
      opts.calls.push(context);

      return { merchantId: 'm1' };
    },
  };
};

describe('ScopeWriteGuard.apply - the operation', () => {
  test('passes the operation to resolve for each write', () => {
    for (const operation of [ScopeOperations.CREATE, ScopeOperations.UPDATE] as const) {
      const calls: Array<unknown> = [];

      ScopeWriteGuard.apply({
        settings: settingsRecording({ calls }),
        model: 'Item',
        rows: [{ merchantId: 'm1' }],
        operation,
      });

      expect(calls).toEqual([{ operation }]);
    }
  });

  test('a READ is refused as a caller bug, before resolve runs', () => {
    const calls: Array<unknown> = [];

    expect(() =>
      ScopeWriteGuard.apply({
        settings: settingsRecording({ calls }),
        model: 'Item',
        rows: [{ merchantId: 'm1' }],
        operation: ScopeOperations.READ,
      }),
    ).toThrow(/runs for a write operation only/);
    expect(calls).toEqual([]);
  });
});

describe('ScopeWriteGuard.apply - a delete payload', () => {
  test('a soft-delete payload that omits the scope column is held like a partial update', () => {
    const rows = ScopeWriteGuard.apply({
      settings: settingsRecording({ calls: [] }),
      model: 'Item',
      rows: [{ deletedAt: new Date(0) }],
      operation: ScopeOperations.DELETE,
    });

    expect(rows).toHaveLength(1);
  });

  test('a soft-delete payload that names another scope is refused', () => {
    expect(() =>
      ScopeWriteGuard.apply({
        settings: settingsRecording({ calls: [] }),
        model: 'Item',
        rows: [{ merchantId: 'other', deletedAt: new Date(0) }],
        operation: ScopeOperations.DELETE,
      }),
    ).toThrow(/write refused by the access scope/);
  });
});

describe('ScopeWriteGuard.mutationWhere - the operation', () => {
  test('sharedRows refuses an or the guard cannot read and keeps the null branch otherwise', () => {
    const settings: IModelAccessSettings = {
      resolve: () => ({ merchantId: 'm1' }),
      write: { sharedRows: true },
    };

    expect(() =>
      ScopeWriteGuard.mutationWhere({
        settings,
        model: 'Item',
        operation: ScopeOperations.DELETE,
        scopeWhere: { or: [{ merchantId: 'm1' }, { counterpartMerchantId: { gt: 'm' } }] },
      }),
    ).toThrow(/the operator 'gt'/);

    const shared = { or: [{ merchantId: 'm1' }, { merchantId: null }] };
    expect(
      ScopeWriteGuard.mutationWhere({
        settings,
        model: 'Item',
        operation: ScopeOperations.DELETE,
        scopeWhere: shared,
      }),
    ).toEqual(shared);
  });

  test('narrows the scope for UPDATE and DELETE', () => {
    for (const operation of [ScopeOperations.UPDATE, ScopeOperations.DELETE] as const) {
      expect(
        ScopeWriteGuard.mutationWhere({
          settings: settingsRecording({ calls: [] }),
          model: 'Item',
          operation,
          scopeWhere: { merchantId: 'm1' },
        }),
      ).toEqual({ merchantId: 'm1' });
    }
  });

  test('a READ is refused as a caller bug', () => {
    expect(() =>
      ScopeWriteGuard.mutationWhere({
        settings: settingsRecording({ calls: [] }),
        model: 'Item',
        operation: ScopeOperations.READ,
        scopeWhere: { merchantId: 'm1' },
      }),
    ).toThrow(/runs for a write operation only/);
  });
});
