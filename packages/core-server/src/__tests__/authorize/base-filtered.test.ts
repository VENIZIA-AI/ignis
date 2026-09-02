import { describe, test, expect } from 'bun:test';
import { newModelFromString } from 'casbin';
import { BaseFilteredAdapter } from '@/components/auth/authorize/adapters/base-filtered';
import type {
  ICasbinPolicyFilter,
  ICasbinPolicySource,
} from '@/components/auth/authorize/adapters/common';

/** The base is a thin, read-only template, so a tiny subclass exercises every branch - the only abstract member is loadFilteredPolicy. */

const MODEL = `
[request_definition]
r = sub, dom, obj, act
[policy_definition]
p = sub, dom, obj, act, eft
[role_definition]
g = _, _, _
[policy_effect]
e = some(where (p.eft == allow)) && !some(where (p.eft == deny))
[matchers]
m = g(r.sub, p.sub, r.dom) && r.obj == p.obj && r.act == p.act
`;

const fakeDataSource = (connector: unknown = { tag: 'connector' }) =>
  // TCasbinPolicyConnector is the full drizzle NodePgDatabase surface - no structural fake covers it.
  ({ connector }) as ICasbinPolicySource;

class TestFilteredAdapter extends BaseFilteredAdapter {
  lines: string[] = [];

  constructor(opts?: { dataSource?: ICasbinPolicySource }) {
    super({ scope: 'TestFilteredAdapter', dataSource: opts?.dataSource ?? fakeDataSource() });
  }

  async loadFilteredPolicy(
    model: Parameters<BaseFilteredAdapter['loadFilteredPolicy']>[0],
    _filter: ICasbinPolicyFilter,
  ): Promise<void> {
    await this.loadLines({ model, lines: this.lines });
  }

  // Expose protected members for direct testing.
  public exposeConnector(): unknown {
    return this.connector;
  }
}

const createAdapter = (opts?: { dataSource?: ICasbinPolicySource }) =>
  new TestFilteredAdapter(opts);

describe('BaseFilteredAdapter - FilteredAdapter contract', () => {
  test('isFiltered() returns true', () => {
    expect(createAdapter().isFiltered()).toBe(true);
  });

  test('loadPolicy() is a no-op resolving to undefined', async () => {
    expect(await createAdapter().loadPolicy()).toBeUndefined();
  });

  test('savePolicy() resolves true', async () => {
    expect(await createAdapter().savePolicy()).toBe(true);
  });

  test('addPolicy() / removePolicy() / removeFilteredPolicy() are no-ops', async () => {
    const adapter = createAdapter();
    expect(await adapter.addPolicy()).toBeUndefined();
    expect(await adapter.removePolicy()).toBeUndefined();
    expect(await adapter.removeFilteredPolicy()).toBeUndefined();
  });
});

describe('BaseFilteredAdapter - datasource plumbing', () => {
  test('connector getter returns the datasource connector', () => {
    const connector = { id: 'pg' };
    expect(createAdapter({ dataSource: fakeDataSource(connector) }).exposeConnector()).toBe(
      connector,
    );
  });
});

describe('BaseFilteredAdapter - loadLines', () => {
  test('parses + loads casbin lines into the model', async () => {
    const adapter = createAdapter();
    adapter.lines = [
      'g, User_1, Role_5, Merchant_10',
      'p, User_1, Merchant_10, order, create, allow',
      'p, Role_5, Merchant_10, order, read, allow',
    ];

    const model = newModelFromString(MODEL);
    const filter: ICasbinPolicyFilter = { principal: { type: 'User', id: 1 } };
    await adapter.loadFilteredPolicy(model, filter);

    expect(model.getPolicy('g', 'g')).toContainEqual(['User_1', 'Role_5', 'Merchant_10']);
    const pRules = model.getPolicy('p', 'p');
    expect(pRules).toContainEqual(['User_1', 'Merchant_10', 'order', 'create', 'allow']);
    expect(pRules).toContainEqual(['Role_5', 'Merchant_10', 'order', 'read', 'allow']);
  });

  test('loading an empty line set leaves the model empty', async () => {
    const adapter = createAdapter();
    adapter.lines = [];
    const model = newModelFromString(MODEL);
    await adapter.loadFilteredPolicy(model, { principal: { type: 'User', id: 1 } });
    expect(model.getPolicy('g', 'g')).toEqual([]);
    expect(model.getPolicy('p', 'p')).toEqual([]);
  });
});
