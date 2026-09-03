import { describe, test, expect, beforeEach } from 'bun:test';
import { getError } from '@venizia/ignis-helpers/core';

import { ReadableSearchRepository, SearchModes } from '@/search/typesense/repositories';
import { DEFAULT_LIMIT } from '@venizia/ignis-kernel';
import type { TSearchDocument } from '@/search/core/models';
import {
  FakeSearchDataSource,
  ProductDocument,
  ProductDocumentWithDefaultLimit,
} from './fake-search-connector';

/** `TSearchDocument` derives `{ id: string; title: string }` directly from the collection definition - no hand-written document interface needed. */
type TProductWithDefaultLimitDocument = TSearchDocument<
  typeof ProductDocumentWithDefaultLimit.schema
>;

describe('ReadableSearchRepository', () => {
  let dataSource: FakeSearchDataSource;
  let repository: ReadableSearchRepository;

  beforeEach(() => {
    dataSource = new FakeSearchDataSource({ name: 'readable-search-ds', config: {} });
    repository = new ReadableSearchRepository(dataSource, { entityClass: ProductDocument });
  });

  describe('find', () => {
    test('translates the filter and strips hidden fields via exclude_fields', async () => {
      dataSource.fakeConnector.searchResponse = {
        found: 2,
        isFoundExact: true,
        hits: [{ document: { id: '1', title: 'A' } }, { document: { id: '2', title: 'B' } }],
      };

      const results = await repository.find({ filter: { where: { status: 'active' } } });

      expect(results).toEqual([
        { id: '1', title: 'A' },
        { id: '2', title: 'B' },
      ]);

      const [call] = dataSource.fakeConnector.searchCalls;
      expect(call.collection).toBe('products');

      const params = call.params as Record<string, unknown>;
      expect(params['exclude_fields']).toBe('secret');
      expect(params['filter_by']).toBe('(isActive:=true && status:=`active`)');
    });

    test('defaultFilter from @model settings is AND-merged into the where clause', async () => {
      await repository.find({ filter: { where: { status: 'active' } } });

      const [call] = dataSource.fakeConnector.searchCalls;
      const params = call.params as Record<string, unknown>;
      expect(params['filter_by']).toBe('(isActive:=true && status:=`active`)');
    });

    test('shouldSkipDefaultFilter bypasses the default filter', async () => {
      await repository.find({
        filter: { where: { status: 'active' } },
        options: { shouldSkipDefaultFilter: true },
      });

      const [call] = dataSource.fakeConnector.searchCalls;
      const params = call.params as Record<string, unknown>;
      expect(params['filter_by']).toBe('status:=`active`');
    });

    test('an empty filter still applies the default filter and excludes hidden fields', async () => {
      await repository.find({ filter: {} });

      const [call] = dataSource.fakeConnector.searchCalls;
      const params = call.params as Record<string, unknown>;
      expect(params['filter_by']).toBe('isActive:=true');
      expect(params['exclude_fields']).toBe('secret');
    });

    test('like operator throws, naming search() as the entry point', async () => {
      let caught: unknown;

      try {
        await repository.find({ filter: { where: { title: { like: '%john%' } } } });
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(Error);
      expect((caught as Error).message).toMatch(/search\(\)/);
    });

    describe('defaultLimit - postgres parity: limit ?? @model settings.defaultLimit ?? DEFAULT_LIMIT', () => {
      test('an omitted limit falls back to DEFAULT_LIMIT when the model has no defaultLimit', async () => {
        await repository.find({ filter: { where: { status: 'active' } } });

        const [call] = dataSource.fakeConnector.searchCalls;
        const params = call.params as Record<string, unknown>;
        expect(params['per_page']).toBe(DEFAULT_LIMIT);
      });

      test('an omitted limit falls back to @model settings.defaultLimit when configured', async () => {
        const limitedRepository = new ReadableSearchRepository(dataSource, {
          entityClass: ProductDocumentWithDefaultLimit,
        });

        await limitedRepository.find({ filter: { where: { title: 'x' } } });

        const [call] = dataSource.fakeConnector.searchCalls;
        const params = call.params as Record<string, unknown>;
        expect(params['per_page']).toBe(5);
      });

      test('an explicit filter.limit always wins over @model settings.defaultLimit', async () => {
        const limitedRepository = new ReadableSearchRepository(dataSource, {
          entityClass: ProductDocumentWithDefaultLimit,
        });

        await limitedRepository.find({ filter: { limit: 25 } });

        const [call] = dataSource.fakeConnector.searchCalls;
        const params = call.params as Record<string, unknown>;
        expect(params['per_page']).toBe(25);
      });
    });

    describe('shouldQueryRange - postgres TDataRange envelope parity', () => {
      test('returns { data, range } shaped like postgres (start/end/total) instead of a bare array', async () => {
        dataSource.fakeConnector.searchResponse = {
          found: 42,
          isFoundExact: true,
          hits: [{ document: { id: '1', title: 'A' } }, { document: { id: '2', title: 'B' } }],
        };

        const result = await repository.find({
          filter: { where: { status: 'active' } },
          options: { shouldQueryRange: true },
        });

        expect(result).toEqual({
          data: [
            { id: '1', title: 'A' },
            { id: '2', title: 'B' },
          ],
          range: { start: 0, end: 1, total: 42 },
        });
      });

      test('reads `total` from the SAME search response as `hits` (no second count call)', async () => {
        dataSource.fakeConnector.searchResponse = { found: 7, isFoundExact: true, hits: [] };

        await repository.find({ filter: {}, options: { shouldQueryRange: true } });

        expect(dataSource.fakeConnector.searchCalls.length).toBe(1);
      });

      test('start/end reflect skip and the returned page size', async () => {
        dataSource.fakeConnector.searchResponse = {
          found: 100,
          isFoundExact: true,
          hits: [{ document: { id: '21' } }, { document: { id: '22' } }],
        };

        const result = await repository.find({
          filter: { skip: 20, limit: 2 },
          options: { shouldQueryRange: true },
        });

        expect(result).toEqual({
          data: [{ id: '21' }, { id: '22' }],
          range: { start: 20, end: 21, total: 100 },
        });
      });

      test('shouldQueryRange falsy still returns a bare array (unchanged default behavior)', async () => {
        dataSource.fakeConnector.searchResponse = {
          found: 1,
          isFoundExact: true,
          hits: [{ document: { id: '1' } }],
        };

        const result = await repository.find({ filter: {} });

        expect(Array.isArray(result)).toBe(true);
      });
    });
  });

  describe('findOne', () => {
    test('returns the first hit document', async () => {
      dataSource.fakeConnector.searchResponse = {
        found: 1,
        isFoundExact: true,
        hits: [{ document: { id: '1', title: 'A' } }],
      };

      const result = await repository.findOne({ filter: { where: { status: 'active' } } });
      expect(result).toEqual({ id: '1', title: 'A' });

      const [call] = dataSource.fakeConnector.searchCalls;
      expect((call.params as Record<string, unknown>)['per_page']).toBe(1);
    });

    test('returns null when there are no hits', async () => {
      dataSource.fakeConnector.searchResponse = { found: 0, isFoundExact: true, hits: [] };

      const result = await repository.findOne({ filter: { where: { status: 'active' } } });
      expect(result).toBeNull();
    });
  });

  describe('count', () => {
    test('counts through document.count, never the search endpoint', async () => {
      dataSource.fakeConnector.countDocumentsResponse = 5;

      const result = await repository.count({ where: { status: 'active' } });
      expect(result).toEqual({ count: 5 });

      // Routing this through search() would inherit that endpoint's cap/estimate on other engines.
      expect(dataSource.fakeConnector.searchCalls).toEqual([]);
    });

    test('passes the translated filter and the collection to document.count', async () => {
      dataSource.fakeConnector.countDocumentsResponse = 0;

      await repository.count({ where: { status: 'active' } });

      const [call] = dataSource.fakeConnector.countDocumentsCalls;
      expect(call?.collection).toBe('products');
      // defaultFilter (isActive: true) is AND-merged into the caller's where, same as find().
      expect(call?.filterBy).toBe('(isActive:=true && status:=`active`)');
    });
  });

  describe('existsWith', () => {
    test('true when count > 0', async () => {
      dataSource.fakeConnector.countDocumentsResponse = 3;
      expect(await repository.existsWith({ where: { status: 'active' } })).toBe(true);
    });

    test('false when count is 0', async () => {
      dataSource.fakeConnector.countDocumentsResponse = 0;
      expect(await repository.existsWith({ where: { status: 'active' } })).toBe(false);
    });
  });

  describe('findById', () => {
    test('returns the document when found - delegates to findOne/search (postgres parity)', async () => {
      dataSource.fakeConnector.searchResponse = {
        found: 1,
        isFoundExact: true,
        hits: [{ document: { id: '1', title: 'A' } }],
      };

      const result = await repository.findById({ id: '1' });
      expect(result).toEqual({ id: '1', title: 'A' });

      const [call] = dataSource.fakeConnector.searchCalls;
      const params = call.params as Record<string, unknown>;
      expect(params['filter_by']).toBe('(isActive:=true && id:=`1`)');
      expect(params['exclude_fields']).toBe('secret');
    });

    test('no hits resolves to null (genuinely missing document)', async () => {
      const result = await repository.findById({ id: 'missing' });
      expect(result).toBeNull();
    });

    test('a defaultFilter-excluded (soft-deleted) document resolves to null', async () => {
      // The fake connector doesn't filter; this asserts the wire query carries defaultWhere AND-merged with the id lookup, which is what makes a real engine exclude it.
      dataSource.fakeConnector.searchResponse = { found: 0, isFoundExact: true, hits: [] };

      const result = await repository.findById({ id: 'soft-deleted' });
      expect(result).toBeNull();

      const [call] = dataSource.fakeConnector.searchCalls;
      const params = call.params as Record<string, unknown>;
      expect(params['filter_by']).toBe('(isActive:=true && id:=`soft-deleted`)');
    });

    test('shouldSkipDefaultFilter bypasses the default filter', async () => {
      dataSource.fakeConnector.searchResponse = {
        found: 1,
        isFoundExact: true,
        hits: [{ document: { id: '1', title: 'A' } }],
      };

      await repository.findById({ id: '1', options: { shouldSkipDefaultFilter: true } });

      const [call] = dataSource.fakeConnector.searchCalls;
      const params = call.params as Record<string, unknown>;
      expect(params['filter_by']).toBe('id:=`1`');
    });

    test('propagates errors from the underlying search', async () => {
      dataSource.fakeConnector.search = async () => {
        throw getError({ statusCode: 500, message: 'boom' });
      };

      let caught: unknown;

      try {
        await repository.findById({ id: '1' });
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(Error);
      expect((caught as Error).message).toBe('boom');
    });
  });

  describe('search', () => {
    describe('mode: raw', () => {
      test('is a raw passthrough - no dialect translation, no default filter', async () => {
        dataSource.fakeConnector.searchResponse = { found: 0, isFoundExact: true, hits: [] };

        const params: Record<string, unknown> = { q: 'shoes' };
        params['query_by'] = 'title';
        const result = await repository.search({ mode: SearchModes.RAW, params });

        expect(result).toEqual({ found: 0, isFoundExact: true, hits: [] });

        const [call] = dataSource.fakeConnector.searchCalls;
        expect(call.collection).toBe('products');
        expect(call.params).toBe(params);
      });
    });

    describe('mode: keyword - common search params (facet/highlight/group/tuning)', () => {
      test('neutral facet/highlight/group params flow through to wire params', async () => {
        await repository.search({
          mode: SearchModes.KEYWORD,
          query: 'shoes',
          facetBy: ['brand'],
          highlightFields: ['title'],
          groupBy: ['brand'],
        });

        const [call] = dataSource.fakeConnector.searchCalls;
        const params = call.params as Record<string, unknown>;
        expect(params['facet_by']).toBe('brand');
        expect(params['highlight_fields']).toBe('title');
        expect(params['group_by']).toBe('brand');
      });

      test('neutral queryByWeights flows through; engine-specific tuning goes via engineParams (wire names)', async () => {
        await repository.search({
          mode: SearchModes.KEYWORD,
          query: 'shoes',
          queryBy: ['title', 'brand'],
          queryByWeights: [2, 1],
          engineParams: {
            ['num_typos']: 2,
            ['use_cache']: true,
            ['prioritize_exact_match']: true,
            ['drop_tokens_threshold']: 1,
            preset: 'my_preset',
          },
        });

        const [call] = dataSource.fakeConnector.searchCalls;
        const params = call.params as Record<string, unknown>;
        expect(params['query_by_weights']).toBe('2,1');
        expect(params['num_typos']).toBe(2);
        expect(params['use_cache']).toBe(true);
        expect(params['prioritize_exact_match']).toBe(true);
        expect(params['drop_tokens_threshold']).toBe(1);
        expect(params['preset']).toBe('my_preset');
      });
    });

    describe('mode: keyword', () => {
      test('goes through buildQuery - defaultFilter and hiddenFields apply', async () => {
        dataSource.fakeConnector.searchResponse = { found: 0, isFoundExact: true, hits: [] };

        await repository.search({
          mode: SearchModes.KEYWORD,
          query: 'shoes',
          queryBy: ['title'],
          filter: { where: { status: 'active' } },
        });

        const [call] = dataSource.fakeConnector.searchCalls;
        const params = call.params as Record<string, unknown>;
        expect(params['q']).toBe('shoes');
        expect(params['query_by']).toBe('title');
        expect(params['filter_by']).toBe('(isActive:=true && status:=`active`)');
        expect(params['exclude_fields']).toBe('secret');
      });

      test('omitted query/queryBy leaves q/query_by unset (bare filter listing)', async () => {
        await repository.search({ mode: SearchModes.KEYWORD });

        const [call] = dataSource.fakeConnector.searchCalls;
        const params = call.params as Record<string, unknown>;
        expect(params['q']).toBe('*');
        expect(params['query_by']).toBeUndefined();
      });
    });

    describe('mode: semantic', () => {
      test('client-supplied nearVector translates through the dialect into vector_query', async () => {
        await repository.search({
          mode: SearchModes.SEMANTIC,
          vectorField: 'embedding',
          nearVector: [0.1, 0.2],
          k: 10,
        });

        const [call] = dataSource.fakeConnector.searchCalls;
        const params = call.params as Record<string, unknown>;
        expect(params['vector_query']).toBe('embedding:([0.1, 0.2], k: 10)');
        expect(params['filter_by']).toBe('isActive:=true');
      });

      test('defaults prefix=false (remote embedders reject prefix search), overridable via engineParams', async () => {
        await repository.search({
          mode: SearchModes.SEMANTIC,
          vectorField: 'embedding',
          queryText: 'x',
        });
        expect(
          (dataSource.fakeConnector.searchCalls[0]?.params as Record<string, unknown>)['prefix'],
        ).toBe(false);

        // prefix is engine-specific tuning now; engineParams merges last and overrides the default.
        await repository.search({
          mode: SearchModes.SEMANTIC,
          vectorField: 'embedding',
          queryText: 'x',
          engineParams: { prefix: true },
        });
        expect(
          (dataSource.fakeConnector.searchCalls[1]?.params as Record<string, unknown>)['prefix'],
        ).toBe(true);
      });

      test('queryText auto-embed path sets q/query_by and a vector_query carrying k', async () => {
        await repository.search({
          mode: SearchModes.SEMANTIC,
          vectorField: 'embedding',
          queryText: 'running shoes',
          k: 5,
        });

        const [call] = dataSource.fakeConnector.searchCalls;
        const params = call.params as Record<string, unknown>;
        expect(params['q']).toBe('running shoes');
        expect(params['query_by']).toBe('embedding');
        expect(params['vector_query']).toBe('embedding:([], k: 5)');
      });

      test('distanceThreshold/ef land in the vector_query clause', async () => {
        await repository.search({
          mode: SearchModes.SEMANTIC,
          vectorField: 'embedding',
          nearVector: [0.1, 0.2],
          distanceThreshold: 0.3,
          ef: 64,
        });

        const [call] = dataSource.fakeConnector.searchCalls;
        const params = call.params as Record<string, unknown>;
        expect(params['vector_query']).toBe(
          'embedding:([0.1, 0.2], distance_threshold: 0.3, ef: 64)',
        );
      });

      test('rejects semantic mode given neither nearVector nor queryText', async () => {
        let caught: unknown;
        try {
          await repository.search({ mode: SearchModes.SEMANTIC, vectorField: 'embedding' });
        } catch (error) {
          caught = error;
        }
        expect((caught as Error | undefined)?.message).toMatch(
          /requires 'nearVector' or 'queryText'/,
        );
      });
    });

    describe('mode: hybrid', () => {
      test('auto-embed (no nearVector) appends vectorField to query_by', async () => {
        await repository.search({
          mode: SearchModes.HYBRID,
          query: 'shoes',
          queryBy: ['title'],
          vectorField: 'embedding',
          k: 10,
        });

        const [call] = dataSource.fakeConnector.searchCalls;
        const params = call.params as Record<string, unknown>;
        expect(params['query_by']).toBe('title,embedding');
        expect(params['vector_query']).toBe('embedding:([], k: 10)');
      });

      test('combines keyword q/query_by with a dialect-translated vector_query', async () => {
        await repository.search({
          mode: SearchModes.HYBRID,
          query: 'shoes',
          queryBy: ['title'],
          vectorField: 'embedding',
          nearVector: [0.1, 0.2],
          alpha: 0.5,
        });

        const [call] = dataSource.fakeConnector.searchCalls;
        const params = call.params as Record<string, unknown>;
        expect(params['q']).toBe('shoes');
        expect(params['query_by']).toBe('title');
        expect(params['vector_query']).toBe('embedding:([0.1, 0.2], alpha: 0.5)');
        expect(params['filter_by']).toBe('isActive:=true');
      });
    });
  });

  describe('TSearchDocument ergonomics', () => {
    test('find() resolves the compile-time-inferred document shape end to end', async () => {
      const typedRepository = new ReadableSearchRepository<TProductWithDefaultLimitDocument>(
        dataSource,
        { entityClass: ProductDocumentWithDefaultLimit },
      );

      dataSource.fakeConnector.searchResponse = {
        found: 1,
        isFoundExact: true,
        hits: [{ document: { id: '1', title: 'Widget' } }],
      };

      const [result] = await typedRepository.find({ filter: { where: { title: 'Widget' } } });

      // `result.title` type-checks as `string` purely from `TSearchDocument<...schema>` - no hand-written document interface anywhere in this file.
      expect(result.title.toUpperCase()).toBe('WIDGET');
      expect(result).toEqual({ id: '1', title: 'Widget' });
    });
  });
});

describe('search - generic result typing', () => {
  test('default R is TDocument-shaped; explicit override is honored', async () => {
    const dataSource = new FakeSearchDataSource({ name: 'search-generic-ds', config: {} });
    const repository = new ReadableSearchRepository(dataSource, { entityClass: ProductDocument });
    dataSource.fakeConnector.searchResponse = {
      found: 1,
      isFoundExact: true,
      hits: [{ document: { id: '1' } }],
    };

    const defaultTyped = await repository.search({ mode: SearchModes.RAW, params: { q: '*' } });
    // Compile-time pin: hits/document are reachable without a cast.
    const hitDocument: object | undefined = defaultTyped.hits?.[0]?.document;
    expect(hitDocument).toEqual({ id: '1' });
    expect(defaultTyped.found).toBe(1);

    type TGroupedDocument = { groupKey: string };
    const overridden = repository.search<TGroupedDocument>({
      mode: SearchModes.RAW,
      params: { q: '*' },
    });
    await overridden;
  });
});
