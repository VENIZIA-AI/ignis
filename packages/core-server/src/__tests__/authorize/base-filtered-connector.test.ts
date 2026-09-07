import { describe, test, expect } from 'bun:test';
import { BaseFilteredAdapter } from '@/components/auth/authorize/adapters/base-filtered';
import type { ICasbinPolicySource } from '@/components/auth/authorize/adapters/common';

/** Cold-datasource regression: `connector` prefers a lazy getConnector(), falls back to a pre-wired `connector` field, and fails loudly - never a bare TypeError - when neither is set. */

class TestFilteredAdapter extends BaseFilteredAdapter {
  constructor(opts: { dataSource: ICasbinPolicySource }) {
    super({ scope: 'TestFilteredAdapter', dataSource: opts.dataSource });
  }

  async loadFilteredPolicy(): Promise<void> {}

  public exposeConnector(): unknown {
    return this.connector;
  }
}

describe('BaseFilteredAdapter - connector resolution', () => {
  test('lazy path: prefers getConnector() and invokes it only on read, not on construction', () => {
    // TCasbinPolicyConnector is the full drizzle NodePgDatabase surface - no structural fake covers it.
    const connector = { tag: 'lazy-connector' } as unknown as ReturnType<
      NonNullable<ICasbinPolicySource['getConnector']>
    >;
    let callCount = 0;
    const dataSource = {
      getConnector: () => {
        callCount += 1;
        return connector;
      },
    } as ICasbinPolicySource;

    const adapter = new TestFilteredAdapter({ dataSource });
    expect(callCount).toBe(0);

    expect(adapter.exposeConnector()).toBe(connector);
    expect(callCount).toBe(1);
  });

  test('fallback path: a source with only connector set is returned as-is', () => {
    // TCasbinPolicyConnector is the full drizzle NodePgDatabase surface - no structural fake covers it.
    const connector: unknown = { tag: 'raw-connector' };
    const dataSource = { connector } as ICasbinPolicySource;

    const adapter = new TestFilteredAdapter({ dataSource });
    expect(adapter.exposeConnector()).toBe(connector);
  });

  test('loud failure: neither getConnector nor connector throws naming BaseFilteredAdapter', () => {
    const dataSource: ICasbinPolicySource = {};
    const adapter = new TestFilteredAdapter({ dataSource });

    expect(() => adapter.exposeConnector()).toThrow(/BaseFilteredAdapter/);
  });
});
