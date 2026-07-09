import { describe, test, expect } from 'bun:test';
import { BaseSearchConnector } from '@/connectors/typesense/connector';
import type { ISearchResult } from '@/connectors/typesense/connector';

const nyi = (): never => {
  throw new Error('nyi');
};

class StubConnector extends BaseSearchConnector {
  healthOk = true;
  constructor() {
    super({ scope: 'StubConnector', identifier: 'stub' });
  }
  getHealth(): Promise<{ ok: boolean }> {
    return Promise.resolve({ ok: this.healthOk });
  }
  // Minimal scoped stubs for the remaining abstract fields (throw — not exercised here).
  collection = {
    create: nyi,
    ensure: nyi,
    get: nyi,
    list: nyi,
    exists: nyi,
    patchSchema: nyi,
    delete: nyi,
  };
  alias = { upsert: nyi, get: nyi };
  synonymSet = { upsert: nyi, get: nyi, list: nyi, delete: nyi, link: nyi };
  document = {
    create: nyi,
    get: nyi,
    upsert: nyi,
    update: nyi,
    delete: nyi,
    import: nyi,
    updateBy: nyi,
    deleteBy: nyi,
    deleteAll: nyi,
    export: nyi,
  };
  search<TDocument extends object = object>(): Promise<ISearchResult<TDocument>> {
    throw new Error('nyi');
  }
  multiSearch(): Promise<unknown> {
    throw new Error('nyi');
  }
}

describe('BaseSearchConnector', () => {
  test('ping() returns true when health ok', async () => {
    const connector = new StubConnector();
    expect(await connector.ping()).toBe(true);
  });

  test('ping() returns false when health not ok', async () => {
    const connector = new StubConnector();
    connector.healthOk = false;
    expect(await connector.ping()).toBe(false);
  });

  test('assertNonEmpty throws on empty value', () => {
    const connector = new StubConnector();
    expect(() =>
      connector['assertNonEmpty']({ value: '', name: 'collection', method: 'getCollection' }),
    ).toThrow();
    expect(() =>
      connector['assertNonEmpty']({ value: '  ', name: 'collection', method: 'getCollection' }),
    ).toThrow();
  });

  test('assertNonEmpty includes the calling method in the thrown message', () => {
    const connector = new StubConnector();
    expect(() =>
      connector['assertNonEmpty']({ value: '', name: 'collection', method: 'getCollection' }),
    ).toThrow('[getCollection] Missing or empty value | name: collection');
  });

  test('assertNonEmpty passes on non-empty value', () => {
    const connector = new StubConnector();
    expect(() =>
      connector['assertNonEmpty']({
        value: 'products',
        name: 'collection',
        method: 'getCollection',
      }),
    ).not.toThrow();
  });
});
