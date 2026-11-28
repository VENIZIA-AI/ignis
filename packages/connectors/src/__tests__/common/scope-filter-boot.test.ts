/**
 * Both branches guard a SILENT runtime failure, and they fail in opposite directions - a
 * search-backed model widens the result set, a context-less one empties it. Neither surfaces as an
 * error a caller can trace back to the declaration, which is why the check runs at boot and throws.
 */

import { AbstractEntity, MetadataRegistry } from '@venizia/ignis-kernel';
import { afterEach, describe, expect, test, beforeEach, afterAll } from 'bun:test';
import { pgTable, serial, text } from 'drizzle-orm/pg-core';
import { ScopeFilterUtility } from '@/common';
import { BaseSearchEntity } from '@/search/core/models';
import { useExecutionRunner } from '../testing/execution-runner';

class RelationalOrder extends AbstractEntity {
  getSchema<T = unknown>(): T {
    return {} as T;
  }
}

class SearchOrder extends BaseSearchEntity {}

const registry = MetadataRegistry.getInstance();

const register = (opts: {
  name: string;
  target: typeof RelationalOrder | typeof SearchOrder;
  withScopeFilter: boolean;
}) => {
  registry.getAllModels().set(opts.name, {
    target: opts.target as never,
    metadata: {
      settings: opts.withScopeFilter ? { access: { resolve: () => null } } : {},
    } as never,
    schema: {},
  });
};

beforeEach(() => useExecutionRunner({ isInstalled: true }));
afterAll(() => useExecutionRunner({ isInstalled: false }));

describe('ScopeFilterUtility.assertScopeFilterSupported', () => {
  afterEach(() => {
    registry.getAllModels().clear();
  });

  test('passes when nothing declares a scope filter, runner or not', () => {
    useExecutionRunner({ isInstalled: false });
    register({ name: 'Order', target: RelationalOrder, withScopeFilter: false });
    register({ name: 'SearchOrder', target: SearchOrder, withScopeFilter: false });

    expect(() => ScopeFilterUtility.assertScopeFilterSupported({})).not.toThrow();
  });

  test('passes for a relational model when a runner is installed', () => {
    register({ name: 'Order', target: RelationalOrder, withScopeFilter: true });

    expect(() => ScopeFilterUtility.assertScopeFilterSupported({})).not.toThrow();
  });

  test('refuses a search-backed model, and names it', () => {
    register({ name: 'SearchOrder', target: SearchOrder, withScopeFilter: true });

    expect(() => ScopeFilterUtility.assertScopeFilterSupported({})).toThrow(/SearchOrder/);
  });

  /** The search branch is about the repository, not the host - a runner must not mask it. */
  test('the search branch fires without a runner too', () => {
    useExecutionRunner({ isInstalled: false });
    register({ name: 'SearchOrder', target: SearchOrder, withScopeFilter: true });

    expect(() => ScopeFilterUtility.assertScopeFilterSupported({})).toThrow(/search-backed/);
  });

  test('refuses a relational model when no runner is installed, and names the fix', () => {
    useExecutionRunner({ isInstalled: false });
    register({ name: 'Order', target: RelationalOrder, withScopeFilter: true });

    expect(() => ScopeFilterUtility.assertScopeFilterSupported({})).toThrow(
      /ExecutionRunner\.install\(\)/,
    );
  });

  /** Search is reported first: it needs a code change, while the other may be one line. */
  test('reports the search model when both problems exist', () => {
    useExecutionRunner({ isInstalled: false });
    register({ name: 'Order', target: RelationalOrder, withScopeFilter: true });
    register({ name: 'SearchOrder', target: SearchOrder, withScopeFilter: true });

    expect(() => ScopeFilterUtility.assertScopeFilterSupported({})).toThrow(/search-backed/);
  });
});

describe('ScopeFilterUtility.assertScopeFilterSupported - the write guard settings', () => {
  const ordersTable = pgTable('boot_guard_orders', {
    id: serial('id').primaryKey(),
    merchantId: text('merchant_id'),
  });

  class GuardedOrder extends AbstractEntity {
    static schema = ordersTable;
    getSchema<T = unknown>(): T {
      return {} as T;
    }
  }

  const registerGuarded = (access: Record<string, unknown>) => {
    registry.getAllModels().set('GuardedOrder', {
      target: GuardedOrder as never,
      metadata: { settings: { access: { resolve: () => null, ...access } } } as never,
      schema: {},
    });
  };

  afterEach(() => {
    registry.getAllModels().clear();
  });

  test('declared columns that exist on the model pass', () => {
    registerGuarded({ columns: ['merchantId'] });

    expect(() => ScopeFilterUtility.assertScopeFilterSupported({})).not.toThrow();
  });

  test('a declared column the model does not have fails at boot, naming the model and the column', () => {
    registerGuarded({ columns: ['merchantId', 'tenantId'] });

    expect(() => ScopeFilterUtility.assertScopeFilterSupported({})).toThrow(
      /GuardedOrder.*tenantId/,
    );
  });

  test('an empty columns list fails at boot', () => {
    registerGuarded({ columns: [] });

    expect(() => ScopeFilterUtility.assertScopeFilterSupported({})).toThrow(/non-empty list/);
  });

  test('a write mode that is neither reject nor assign fails at boot', () => {
    registerGuarded({ write: { mode: 'ignore' } });

    expect(() => ScopeFilterUtility.assertScopeFilterSupported({})).toThrow(/write\.mode 'ignore'/);
  });

  test('reject and assign pass', () => {
    registerGuarded({ write: { mode: 'assign' } });
    expect(() => ScopeFilterUtility.assertScopeFilterSupported({})).not.toThrow();

    registerGuarded({ write: { mode: 'reject' } });
    expect(() => ScopeFilterUtility.assertScopeFilterSupported({})).not.toThrow();
  });
});
