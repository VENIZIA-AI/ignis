import { beforeEach, describe, expect, test } from 'bun:test';
import { ReadableSearchRepository } from '@/search/typesense/repositories';
import type { ISearchFacetCount } from '@/search/core';
import {
  FakeSearchDataSource,
  ProductDocument,
  ProductDocumentNoDefaultFilter,
  ProductDocumentWithDefaultQueryBy,
} from './fake-search-connector';

const wireOf = (dataSource: FakeSearchDataSource): Record<string, unknown> => {
  const [call] = dataSource.fakeConnector.searchCalls;
  return call.params as Record<string, unknown>;
};

/** The message a call fails with, or '' when it does not fail. */
const failureOf = async (run: () => Promise<unknown>): Promise<string> => {
  try {
    await run();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return '';
};

const statusFacet: ISearchFacetCount = {
  fieldName: 'status',
  counts: [
    { value: 'active', count: 7 },
    { value: 'draft', count: 2 },
  ],
};

describe('ReadableSearchRepository - searchCount, facets and suggest', () => {
  let dataSource: FakeSearchDataSource;
  let repository: ReadableSearchRepository;

  beforeEach(() => {
    dataSource = new FakeSearchDataSource({ name: 'count-facets-suggest-ds', config: {} });
    repository = new ReadableSearchRepository(dataSource, { entityClass: ProductDocument });
  });

  describe('searchCount', () => {
    test('counts a text search through a page of zero hits and returns found', async () => {
      dataSource.fakeConnector.searchResponse = { found: 42, isFoundExact: true, hits: [] };

      const result = await repository.searchCount({
        query: 'shoes',
        queryBy: ['title', 'name'],
        where: { status: 'active' },
      });

      expect(result).toEqual({ count: 42, isFoundExact: true });
      expect(dataSource.fakeConnector.searchCalls).toHaveLength(1);

      const wire = wireOf(dataSource);
      expect(wire['q']).toBe('shoes');
      expect(wire['query_by']).toBe('title,name');
      expect(wire['per_page']).toBe(0);
      expect(wire['filter_by']).toBe('(isActive:=true && status:=`active`)');
    });

    test('reports an estimate as not exact', async () => {
      dataSource.fakeConnector.searchResponse = { found: 10, isFoundExact: false };

      const result = await repository.searchCount({ query: 'shoes', queryBy: ['title'] });

      expect(result).toEqual({ count: 10, isFoundExact: false });
    });

    test('falls back to the collection defaultQueryBy', async () => {
      const withDefault = new ReadableSearchRepository(dataSource, {
        entityClass: ProductDocumentWithDefaultQueryBy,
      });

      await withDefault.searchCount({ query: 'widget' });

      expect(wireOf(dataSource)['query_by']).toBe('title,name');
    });

    test('a where that matches nothing answers zero without calling the engine', async () => {
      const unfiltered = new ReadableSearchRepository(dataSource, {
        entityClass: ProductDocumentNoDefaultFilter,
      });

      const result = await unfiltered.searchCount({
        query: 'shoes',
        queryBy: ['title'],
        where: { or: [] },
      });

      expect(result).toEqual({ count: 0, isFoundExact: true });
      expect(dataSource.fakeConnector.searchCalls).toHaveLength(0);
    });
  });

  describe('facets', () => {
    test('asks for facets only: a page of zero hits, the facet params on the wire', async () => {
      dataSource.fakeConnector.searchResponse = {
        found: 9,
        isFoundExact: true,
        facetCounts: [statusFacet],
      };

      const result = await repository.facets({
        facetBy: ['status', 'name'],
        maxFacetValues: 5,
        facetQuery: 'status:ac',
      });

      expect(result).toEqual({ facets: [statusFacet], found: 9, isFoundExact: true });

      const wire = wireOf(dataSource);
      expect(wire['q']).toBe('*');
      expect(wire['per_page']).toBe(0);
      expect(wire['facet_by']).toBe('status,name');
      expect(wire['max_facet_values']).toBe(5);
      expect(wire['facet_query']).toBe('status:ac');
    });

    test('scopes the facets to a text query and a where', async () => {
      await repository.facets({
        facetBy: ['status'],
        query: 'shoes',
        queryBy: ['title'],
        where: { name: 'nike' },
      });

      const wire = wireOf(dataSource);
      expect(wire['q']).toBe('shoes');
      expect(wire['query_by']).toBe('title');
      expect(wire['filter_by']).toBe('(isActive:=true && name:=`nike`)');
    });

    test('an engine answer without facets gives an empty list', async () => {
      dataSource.fakeConnector.searchResponse = { found: 3, isFoundExact: true };

      const result = await repository.facets({ facetBy: ['status'] });

      expect(result.facets).toEqual([]);
      expect(result.found).toBe(3);
    });

    test('refuses an empty facetBy before any request', async () => {
      const result2 = await failureOf(() => repository.facets({ facetBy: [] }));
      expect(result2).toMatch(/facetBy/);
      const result3 = await failureOf(() => repository.facets({ facetBy: [' '] }));
      expect(result3).toMatch(/facetBy/);
      expect(dataSource.fakeConnector.searchCalls).toHaveLength(0);
    });

    test('refuses a maxFacetValues that is not a positive integer before any request', async () => {
      for (const maxFacetValues of [0, -1, 2.5, Number.NaN]) {
        const result4 = await failureOf(() =>
          repository.facets({ facetBy: ['status'], maxFacetValues }),
        );
        expect(result4).toMatch(/maxFacetValues/);
      }
      expect(dataSource.fakeConnector.searchCalls).toHaveLength(0);
    });

    test('a where that matches nothing answers empty without calling the engine', async () => {
      const unfiltered = new ReadableSearchRepository(dataSource, {
        entityClass: ProductDocumentNoDefaultFilter,
      });

      const result = await unfiltered.facets({ facetBy: ['status'], where: { or: [] } });

      expect(result).toEqual({ facets: [], found: 0, isFoundExact: true });
      expect(dataSource.fakeConnector.searchCalls).toHaveLength(0);
    });
  });

  describe('suggest', () => {
    test('is a keyword prefix search with no highlight and a page of 8', async () => {
      dataSource.fakeConnector.searchResponse = {
        found: 2,
        isFoundExact: true,
        hits: [
          { document: { id: '1', title: 'Shoe', secret: 's1' } },
          { document: { id: '2', title: 'Shoelace', secret: 's2' } },
        ],
      };

      const documents = await repository.suggest({ query: 'sho', queryBy: ['title'] });

      expect(documents).toEqual([
        { id: '1', title: 'Shoe' },
        { id: '2', title: 'Shoelace' },
      ]);

      const wire = wireOf(dataSource);
      expect(wire['q']).toBe('sho');
      expect(wire['query_by']).toBe('title');
      expect(wire['prefix']).toBeUndefined();
      expect(wire['highlight_fields']).toBe('none');
      expect(wire['per_page']).toBe(8);
      expect(wire['filter_by']).toBe('isActive:=true');
      expect(wire['vector_query']).toBeUndefined();
    });

    test('takes the page size, the field projection and a where', async () => {
      await repository.suggest({
        query: 'sho',
        queryBy: ['title'],
        limit: 3,
        includeFields: ['id', 'title'],
        where: { status: 'active' },
      });

      const wire = wireOf(dataSource);
      expect(wire['per_page']).toBe(3);
      expect(wire['include_fields']).toBe('id,title');
      expect(wire['filter_by']).toBe('(isActive:=true && status:=`active`)');
    });

    test('falls back to the collection defaultQueryBy', async () => {
      const withDefault = new ReadableSearchRepository(dataSource, {
        entityClass: ProductDocumentWithDefaultQueryBy,
      });

      await withDefault.suggest({ query: 'wid' });

      expect(wireOf(dataSource)['query_by']).toBe('title,name');
    });

    test('a blank query answers an empty list without calling the engine', async () => {
      const result5 = await repository.suggest({ query: '' });
      expect(result5).toEqual([]);
      const result6 = await repository.suggest({ query: '   ' });
      expect(result6).toEqual([]);
      expect(dataSource.fakeConnector.searchCalls).toHaveLength(0);
    });

    test('refuses a limit that is not a positive integer before any request', async () => {
      for (const limit of [0, -1, 2.5, Number.NaN]) {
        const result7 = await failureOf(() => repository.suggest({ query: 'sho', limit }));
        expect(result7).toMatch(/limit/);
      }
      expect(dataSource.fakeConnector.searchCalls).toHaveLength(0);
    });
  });

  describe('hidden fields', () => {
    test('facets refuses a hidden field in facetBy, before any request', async () => {
      const result8 = await failureOf(() => repository.facets({ facetBy: ['status', 'secret'] }));
      expect(result8).toMatch(/secret/);
      expect(dataSource.fakeConnector.searchCalls).toHaveLength(0);
    });

    test('facets refuses a hidden field named by facetQuery', async () => {
      const result9 = await failureOf(() =>
        repository.facets({ facetBy: ['status'], facetQuery: 'secret:ab' }),
      );
      expect(result9).toMatch(/secret/);
    });

    test('a hidden field is refused in queryBy on every call that takes one', async () => {
      const queryBy = ['title', 'secret'];

      const result10 = await failureOf(() => repository.searchCount({ query: 'x', queryBy }));
      expect(result10).toMatch(/secret/);
      const result11 = await failureOf(() => repository.suggest({ query: 'x', queryBy }));
      expect(result11).toMatch(/secret/);
      const result12 = await failureOf(() =>
        repository.facets({ facetBy: ['status'], query: 'x', queryBy }),
      );
      expect(result12).toMatch(/secret/);
      const result13 = await failureOf(() =>
        repository.search({ mode: 'keyword', query: 'x', queryBy }),
      );
      expect(result13).toMatch(/secret/);
      expect(dataSource.fakeConnector.searchCalls).toHaveLength(0);
    });

    test('a hidden field is refused in groupBy, highlightFields and highlightFullFields', async () => {
      for (const param of ['groupBy', 'highlightFields', 'highlightFullFields']) {
        const result14 = await failureOf(() =>
          repository.search({
            mode: 'keyword',
            query: 'x',
            [param]: ['title', 'secret'],
          } as never),
        );
        expect(result14).toMatch(new RegExp(param));
      }
      expect(dataSource.fakeConnector.searchCalls).toHaveLength(0);
    });

    test('visible groupBy and highlight fields are not refused', async () => {
      await repository.search({
        mode: 'keyword',
        query: 'x',
        groupBy: ['status'],
        highlightFields: ['title'],
        highlightFullFields: ['title'],
      });

      expect(dataSource.fakeConnector.searchCalls).toHaveLength(1);
    });

    test('a visible field is not refused', async () => {
      await repository.facets({
        facetBy: ['status'],
        facetQuery: 'status:ac',
        queryBy: ['title'],
        query: 'x',
      });

      expect(dataSource.fakeConnector.searchCalls).toHaveLength(1);
    });
  });

  describe('tuning through engineParams', () => {
    const tuning = { numTypos: 0, useCache: true, cacheTtl: 30, maxCandidates: 4 };

    const expectTuning = (wire: Record<string, unknown>) => {
      expect(wire['num_typos']).toBe(0);
      expect(wire['use_cache']).toBe(true);
      expect(wire['cache_ttl']).toBe(30);
      expect(wire['max_candidates']).toBe(4);
      expect(wire).not.toHaveProperty('numTypos');
    };

    test('searchCount sends the tuning the way search does', async () => {
      await repository.searchCount({ query: 'cafe', queryBy: ['title'], engineParams: tuning });

      expectTuning(wireOf(dataSource));
    });

    test('facets sends the tuning the way search does', async () => {
      await repository.facets({ facetBy: ['status'], query: 'cafe', engineParams: tuning });

      expectTuning(wireOf(dataSource));
    });

    test('suggest sends the tuning the way search does', async () => {
      await repository.suggest({ query: 'cafe', queryBy: ['title'], engineParams: tuning });

      expectTuning(wireOf(dataSource));
    });

    test('a wire-named key passes verbatim next to the camelCase names', async () => {
      await repository.suggest({
        query: 'cafe',
        queryBy: ['title'],
        engineParams: { ['pinned_hits']: '1:1', numTypos: 1 },
      });

      expect(wireOf(dataSource)['pinned_hits']).toBe('1:1');
      expect(wireOf(dataSource)['num_typos']).toBe(1);
    });

    test('an invalid tuning value is refused before any request, on all three', async () => {
      const bad = { numTypos: -1 };
      const runs = [
        () => repository.searchCount({ query: 'x', queryBy: ['title'], engineParams: bad }),
        () => repository.facets({ facetBy: ['status'], engineParams: bad }),
        () => repository.suggest({ query: 'x', queryBy: ['title'], engineParams: bad }),
      ];

      for (const run of runs) {
        const message = await failureOf(run);
        expect(message).toMatch(/numTypos/);
      }
      expect(dataSource.fakeConnector.searchCalls).toHaveLength(0);
    });

    test('no engineParams leaves the wire untuned', async () => {
      await repository.suggest({ query: 'cafe', queryBy: ['title'] });

      expect(wireOf(dataSource)).not.toHaveProperty('num_typos');
      expect(wireOf(dataSource)).not.toHaveProperty('use_cache');
    });
  });

  describe('sort reaches the wire', () => {
    test('search sends filter.order as sort_by', async () => {
      await repository.search({
        mode: 'keyword',
        query: 'x',
        queryBy: ['title'],
        filter: { order: ['status DESC', 'name'] },
      });

      expect(wireOf(dataSource)['sort_by']).toBe('status:desc,name:asc');
    });
  });
});
