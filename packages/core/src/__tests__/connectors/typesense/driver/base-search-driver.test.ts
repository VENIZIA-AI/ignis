import { describe, test, expect } from 'bun:test';
import { BaseSearchDriver } from '@/connectors/typesense/driver';
import type { IImportResult, IAliasInfo, ISearchResult } from '@/connectors/typesense/driver';

class StubDriver extends BaseSearchDriver {
  healthOk = true;
  constructor() {
    super({ scope: 'StubDriver', identifier: 'stub' });
  }
  getHealth(): Promise<{ ok: boolean }> {
    return Promise.resolve({ ok: this.healthOk });
  }
  // Minimal stubs for the remaining abstract verbs (throw — not exercised here).
  createCollection(): Promise<unknown> {
    throw new Error('nyi');
  }
  ensureCollection(): Promise<unknown> {
    throw new Error('nyi');
  }
  getCollection(): Promise<unknown> {
    throw new Error('nyi');
  }
  listCollections(): Promise<unknown[]> {
    throw new Error('nyi');
  }
  collectionExists(): Promise<boolean> {
    throw new Error('nyi');
  }
  patchCollectionSchema(): Promise<void> {
    throw new Error('nyi');
  }
  deleteCollection(): Promise<boolean> {
    throw new Error('nyi');
  }
  upsertAlias(): Promise<void> {
    throw new Error('nyi');
  }
  getAlias(): Promise<IAliasInfo | null> {
    throw new Error('nyi');
  }
  createDocument<T extends object>(): Promise<T> {
    throw new Error('nyi');
  }
  getDocument<T extends object>(): Promise<T> {
    throw new Error('nyi');
  }
  upsertDocument<T extends object>(): Promise<T> {
    throw new Error('nyi');
  }
  updateDocument<T extends object>(): Promise<T> {
    throw new Error('nyi');
  }
  deleteDocument(): Promise<boolean> {
    throw new Error('nyi');
  }
  importDocuments(): Promise<IImportResult<unknown>> {
    throw new Error('nyi');
  }
  updateByFilter(): Promise<{ updatedCount: number }> {
    throw new Error('nyi');
  }
  deleteByFilter(): Promise<number> {
    throw new Error('nyi');
  }
  deleteAllDocuments(): Promise<boolean> {
    throw new Error('nyi');
  }
  exportDocuments(): Promise<string> {
    throw new Error('nyi');
  }
  search<TDocument extends object = object>(): Promise<ISearchResult<TDocument>> {
    throw new Error('nyi');
  }
  multiSearch(): Promise<unknown> {
    throw new Error('nyi');
  }
}

describe('BaseSearchDriver', () => {
  test('ping() returns true when health ok', async () => {
    const driver = new StubDriver();
    expect(await driver.ping()).toBe(true);
  });

  test('ping() returns false when health not ok', async () => {
    const driver = new StubDriver();
    driver.healthOk = false;
    expect(await driver.ping()).toBe(false);
  });

  test('assertNonEmpty throws on empty value', () => {
    const driver = new StubDriver();
    expect(() =>
      driver['assertNonEmpty']({ value: '', name: 'collection', method: 'getCollection' }),
    ).toThrow();
    expect(() =>
      driver['assertNonEmpty']({ value: '  ', name: 'collection', method: 'getCollection' }),
    ).toThrow();
  });

  test('assertNonEmpty includes the calling method in the thrown message', () => {
    const driver = new StubDriver();
    expect(() =>
      driver['assertNonEmpty']({ value: '', name: 'collection', method: 'getCollection' }),
    ).toThrow('[getCollection] Missing or empty value | name: collection');
  });

  test('assertNonEmpty passes on non-empty value', () => {
    const driver = new StubDriver();
    expect(() =>
      driver['assertNonEmpty']({ value: 'products', name: 'collection', method: 'getCollection' }),
    ).not.toThrow();
  });
});
