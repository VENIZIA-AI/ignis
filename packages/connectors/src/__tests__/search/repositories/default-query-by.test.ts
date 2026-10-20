import { describe, test, expect, beforeEach } from 'bun:test';

import { ReadableSearchRepository, SearchModes } from '@/search/typesense/repositories';
import {
  FakeSearchDataSource,
  ProductDocument,
  ProductDocumentWithDefaultQueryBy,
} from './fake-search-connector';

/**
 * Typesense cannot run a text search without being told WHICH FIELDS the text should match
 * against - it does not guess. Before `defaultQueryBy`, that knowledge lived at every call site
 * instead of in the one place that knows it: the collection.
 *
 * The fallback is resolved HERE, in the repository, and never in the dialect: the repository knows
 * the entity, and `applySearchInput` is deliberately collection-blind.
 */
describe('ReadableSearchRepository - the collection declares what searching it means', () => {
  let dataSource: FakeSearchDataSource;

  const queryByOf = (): unknown => {
    const [call] = dataSource.fakeConnector.searchCalls;
    return (call.params as Record<string, unknown>)['query_by'];
  };

  beforeEach(() => {
    dataSource = new FakeSearchDataSource({ name: 'default-query-by-ds', config: {} });
  });

  describe('a collection that declares defaultQueryBy', () => {
    let repository: ReadableSearchRepository;

    beforeEach(() => {
      repository = new ReadableSearchRepository(dataSource, {
        entityClass: ProductDocumentWithDefaultQueryBy,
      });
    });

    test('a keyword search with no queryBy uses the collection default', async () => {
      await repository.search({ mode: SearchModes.KEYWORD, query: 'widget' });

      expect(queryByOf()).toBe('title,name');
    });

    test('an explicit caller queryBy WINS over the default', async () => {
      await repository.search({
        mode: SearchModes.KEYWORD,
        query: 'widget',
        queryBy: ['name'],
      });

      expect(queryByOf()).toBe('name');
    });

    test('a wildcard term sends NO query_by, even with a default declared', async () => {
      // `*` matches every document regardless of field, so naming fields for it is meaningless.
      await repository.search({ mode: SearchModes.KEYWORD, query: '*' });

      expect(queryByOf()).toBeUndefined();
    });

    test('an absent term sends NO query_by - the listing case find() also produces', async () => {
      await repository.search({ mode: SearchModes.KEYWORD });

      expect(queryByOf()).toBeUndefined();
    });

    test('a blank/whitespace term sends NO query_by', async () => {
      await repository.search({ mode: SearchModes.KEYWORD, query: '   ' });

      expect(queryByOf()).toBeUndefined();
    });

    test('semantic mode is untouched - query_by stays the vector field', async () => {
      // Semantic carries `vectorField`, never `queryBy`; a fallback leaking in would overwrite it.
      await repository.search({
        mode: SearchModes.SEMANTIC,
        vectorField: 'embedding',
        queryText: 'widget',
      });

      expect(queryByOf()).toBe('embedding');
    });

    test('hybrid mode is untouched - its queryBy is required, so it is never absent', async () => {
      await repository.search({
        mode: SearchModes.HYBRID,
        query: 'widget',
        queryBy: ['title'],
        vectorField: 'embedding',
      });

      expect(queryByOf()).toBe('title,embedding');
    });
  });

  describe('a collection that declares no defaultQueryBy', () => {
    let repository: ReadableSearchRepository;

    beforeEach(() => {
      repository = new ReadableSearchRepository(dataSource, { entityClass: ProductDocument });
    });

    test('a keyword search with a real term sends no query_by, exactly as before', async () => {
      await repository.search({ mode: SearchModes.KEYWORD, query: 'widget' });

      expect(queryByOf()).toBeUndefined();
    });

    test('an explicit caller queryBy is still honoured', async () => {
      await repository.search({
        mode: SearchModes.KEYWORD,
        query: 'widget',
        queryBy: ['title'],
      });

      expect(queryByOf()).toBe('title');
    });
  });
});
