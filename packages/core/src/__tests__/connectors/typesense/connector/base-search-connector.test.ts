import { describe, test, expect } from 'bun:test';
import { BaseSearchConnector } from '@/connectors/typesense/connector';
import type { IImportResult, IAliasInfo, ISearchResult } from '@/connectors/typesense/connector';
import type { ISynonym } from '@/connectors/typesense/models';

class StubConnector extends BaseSearchConnector {
  healthOk = true;
  constructor() {
    super({ scope: 'StubConnector', identifier: 'stub' });
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
  upsertSynonymSet(): Promise<void> {
    throw new Error('nyi');
  }
  getSynonymSet(): Promise<ISynonym[] | null> {
    throw new Error('nyi');
  }
  listSynonymSets(): Promise<string[]> {
    throw new Error('nyi');
  }
  deleteSynonymSet(): Promise<boolean> {
    throw new Error('nyi');
  }
  linkSynonymSets(): Promise<void> {
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
