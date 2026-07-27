import { describe, test, expect } from 'bun:test';
import { BaseSearchConnector } from '@/connectors/search';
import type { ISearchResult } from '@/connectors/search';

const nyi = (): never => {
  throw new Error('nyi');
};

/** Stubs only what the NEUTRAL base declares abstract - no `alias`, no `synonymSet`. Those are engine-specific groups, so a connector that omits them must still satisfy BaseSearchConnector. */
class StubConnector extends BaseSearchConnector {
  healthOk = true;
  constructor() {
    super({ scope: 'StubConnector', identifier: 'stub' });
  }
  getHealth(): Promise<{ ok: boolean }> {
    return Promise.resolve({ ok: this.healthOk });
  }
  protected isNotFoundError(): boolean {
    return false;
  }
  collection = {
    create: nyi,
    ensure: nyi,
    get: nyi,
    list: nyi,
    exists: nyi,
    patchSchema: nyi,
    delete: nyi,
  };
  document = {
    create: nyi,
    get: nyi,
    count: nyi,
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
