/**
 * Both branches guard a SILENT runtime failure, and they fail in opposite directions - a
 * search-backed model widens the result set, a context-less one empties it. Neither surfaces as an
 * error a caller can trace back to the declaration, which is why the check runs at boot and throws.
 */

import { AbstractEntity, MetadataRegistry } from '@venizia/ignis-kernel';
import { afterEach, describe, expect, test } from 'bun:test';
import { pgTable, serial, text } from 'drizzle-orm/pg-core';
import { assertScopeFilterSupported } from '@/common';
import { BaseSearchEntity } from '@/search/core/models';

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

describe('assertScopeFilterSupported', () => {
  afterEach(() => {
    registry.getAllModels().clear();
  });

  test('passes when nothing declares a scope filter', () => {
    register({ name: 'Order', target: RelationalOrder, withScopeFilter: false });
    register({ name: 'SearchOrder', target: SearchOrder, withScopeFilter: false });

    expect(() => assertScopeFilterSupported({ asyncContextEnabled: false })).not.toThrow();
  });

  test('passes for a relational model when the context store is on', () => {
    register({ name: 'Order', target: RelationalOrder, withScopeFilter: true });

    expect(() => assertScopeFilterSupported({ asyncContextEnabled: true })).not.toThrow();
  });

  test('refuses a search-backed model, and names it', () => {
    register({ name: 'SearchOrder', target: SearchOrder, withScopeFilter: true });

    expect(() => assertScopeFilterSupported({ asyncContextEnabled: true })).toThrow(/SearchOrder/);
  });

  /** The search branch is about the repository, not the config - enabling the store must not mask it. */
  test('the search branch fires regardless of the context store', () => {
    register({ name: 'SearchOrder', target: SearchOrder, withScopeFilter: true });

    expect(() => assertScopeFilterSupported({ asyncContextEnabled: false })).toThrow(
      /search-backed/,
    );
  });

  test('refuses a relational model when the context store is off, and names the flag', () => {
    register({ name: 'Order', target: RelationalOrder, withScopeFilter: true });

    expect(() => assertScopeFilterSupported({ asyncContextEnabled: false })).toThrow(
      /asyncContext\.enable/,
    );
  });

  /** Search is reported first: it needs a code change, while the other may be one config line. */
  test('reports the search model when both problems exist', () => {
    register({ name: 'Order', target: RelationalOrder, withScopeFilter: true });
    register({ name: 'SearchOrder', target: SearchOrder, withScopeFilter: true });

    expect(() => assertScopeFilterSupported({ asyncContextEnabled: false })).toThrow(
      /search-backed/,
    );
  });
});

describe('assertScopeFilterSupported - the write guard settings', () => {
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

    expect(() => assertScopeFilterSupported({ asyncContextEnabled: true })).not.toThrow();
  });

  test('a declared column the model does not have fails at boot, naming the model and the column', () => {
    registerGuarded({ columns: ['merchantId', 'tenantId'] });

    expect(() => assertScopeFilterSupported({ asyncContextEnabled: true })).toThrow(
      /GuardedOrder.*tenantId/,
    );
  });

  test('an empty columns list fails at boot', () => {
    registerGuarded({ columns: [] });

    expect(() => assertScopeFilterSupported({ asyncContextEnabled: true })).toThrow(
      /non-empty list/,
    );
  });

  test('a write mode that is neither reject nor assign fails at boot', () => {
    registerGuarded({ write: { mode: 'ignore' } });

    expect(() => assertScopeFilterSupported({ asyncContextEnabled: true })).toThrow(
      /write\.mode 'ignore'/,
    );
  });

  test('reject and assign pass', () => {
    registerGuarded({ write: { mode: 'assign' } });
    expect(() => assertScopeFilterSupported({ asyncContextEnabled: true })).not.toThrow();

    registerGuarded({ write: { mode: 'reject' } });
    expect(() => assertScopeFilterSupported({ asyncContextEnabled: true })).not.toThrow();
  });
});
