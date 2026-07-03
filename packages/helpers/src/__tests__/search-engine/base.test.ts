import { describe, test, expect } from 'bun:test';
import { BaseSearchEngineHelper } from '@/modules/search-engine/base';
import type {
  ISearchEngineTypeMap,
  IImportResult,
  IAliasInfo,
} from '@/modules/search-engine/types';

class StubEngine extends BaseSearchEngineHelper {
  healthOk = true;
  constructor() {
    super({ scope: 'StubEngine', identifier: 'stub' });
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
  search(): Promise<unknown> {
    throw new Error('nyi');
  }
  multiSearch(): Promise<unknown> {
    throw new Error('nyi');
  }
}

describe('BaseSearchEngineHelper', () => {
  test('ping() returns true when health ok', async () => {
    const engine = new StubEngine();
    expect(await engine.ping()).toBe(true);
  });

  test('ping() returns false when health not ok', async () => {
    const engine = new StubEngine();
    engine.healthOk = false;
    expect(await engine.ping()).toBe(false);
  });

  test('assertNonEmpty throws on empty value', () => {
    const engine = new StubEngine();
    expect(() => engine['assertNonEmpty']({ value: '', name: 'collection' })).toThrow();
    expect(() => engine['assertNonEmpty']({ value: '  ', name: 'collection' })).toThrow();
  });

  test('assertNonEmpty passes on non-empty value', () => {
    const engine = new StubEngine();
    expect(() => engine['assertNonEmpty']({ value: 'products', name: 'collection' })).not.toThrow();
  });

  const typeMapCheck: ISearchEngineTypeMap = {
    schema: {},
    collection: {},
    field: {},
    searchParams: {},
    searchResult: {},
    multiSearchRequest: {},
    multiSearchResult: {},
    importResponse: {},
  };
  test('type map shape is exported', () => {
    expect(Object.keys(typeMapCheck).length).toBe(8);
  });
});
