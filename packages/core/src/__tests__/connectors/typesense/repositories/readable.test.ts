import { describe, test, expect, beforeEach } from 'bun:test';
import { getError } from '@venizia/ignis-helpers';

import { ReadableSearchRepository } from '@/connectors/typesense/repositories';
import { DEFAULT_LIMIT } from '@/base/repositories/common';
import { TInferSearchDocument } from '@/connectors/typesense/models';
import {
  FakeSearchDataSource,
  ProductDocument,
  ProductDocumentWithDefaultLimit,
} from './fake-search-driver';

/** `TInferSearchDocument` derives `{ id: string; title: string }` directly from the collection
 * definition - no hand-written document interface needed. */
type TProductWithDefaultLimitDocument = TInferSearchDocument<
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
      dataSource.fakeDriver.searchResponse = {
        found: 2,
        hits: [{ document: { id: '1', title: 'A' } }, { document: { id: '2', title: 'B' } }],
      };

      const results = await repository.find({ filter: { where: { status: 'active' } } });

      expect(results).toEqual([
        { id: '1', title: 'A' },
        { id: '2', title: 'B' },
      ]);

      const [call] = dataSource.fakeDriver.searchCalls;
      expect(call.collection).toBe('products');

      const params = call.params as Record<string, unknown>;
      expect(params['exclude_fields']).toBe('secret');
      expect(params['filter_by']).toBe('(isActive:=true && status:=`active`)');
    });

    test('defaultFilter from @model settings is AND-merged into the where clause', async () => {
      await repository.find({ filter: { where: { status: 'active' } } });

      const [call] = dataSource.fakeDriver.searchCalls;
      const params = call.params as Record<string, unknown>;
      expect(params['filter_by']).toBe('(isActive:=true && status:=`active`)');
    });

    test('shouldSkipDefaultFilter bypasses the default filter', async () => {
      await repository.find({
        filter: { where: { status: 'active' } },
        options: { shouldSkipDefaultFilter: true },
      });

      const [call] = dataSource.fakeDriver.searchCalls;
      const params = call.params as Record<string, unknown>;
      expect(params['filter_by']).toBe('status:=`active`');
    });

    test('no filter still applies the default filter and excludes hidden fields', async () => {
      await repository.find();

      const [call] = dataSource.fakeDriver.searchCalls;
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

        const [call] = dataSource.fakeDriver.searchCalls;
        const params = call.params as Record<string, unknown>;
        expect(params['per_page']).toBe(DEFAULT_LIMIT);
      });

      test('an omitted limit falls back to @model settings.defaultLimit when configured', async () => {
        const limitedRepository = new ReadableSearchRepository(dataSource, {
          entityClass: ProductDocumentWithDefaultLimit,
        });

        await limitedRepository.find({ filter: { where: { title: 'x' } } });

        const [call] = dataSource.fakeDriver.searchCalls;
        const params = call.params as Record<string, unknown>;
        expect(params['per_page']).toBe(5);
      });

      test('an explicit filter.limit always wins over @model settings.defaultLimit', async () => {
        const limitedRepository = new ReadableSearchRepository(dataSource, {
          entityClass: ProductDocumentWithDefaultLimit,
        });

        await limitedRepository.find({ filter: { limit: 25 } });

        const [call] = dataSource.fakeDriver.searchCalls;
        const params = call.params as Record<string, unknown>;
        expect(params['per_page']).toBe(25);
      });
    });

    describe('shouldQueryRange - postgres TDataRange envelope parity', () => {
      test('returns { data, range } shaped like postgres (start/end/total) instead of a bare array', async () => {
        dataSource.fakeDriver.searchResponse = {
          found: 42,
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
        dataSource.fakeDriver.searchResponse = { found: 7, hits: [] };

        await repository.find({ filter: {}, options: { shouldQueryRange: true } });

        expect(dataSource.fakeDriver.searchCalls.length).toBe(1);
      });

      test('start/end reflect skip and the returned page size', async () => {
        dataSource.fakeDriver.searchResponse = {
          found: 100,
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
        dataSource.fakeDriver.searchResponse = { found: 1, hits: [{ document: { id: '1' } }] };

        const result = await repository.find({ filter: {} });

        expect(Array.isArray(result)).toBe(true);
      });
    });
  });

  describe('findOne', () => {
    test('returns the first hit document', async () => {
      dataSource.fakeDriver.searchResponse = {
        found: 1,
        hits: [{ document: { id: '1', title: 'A' } }],
      };

      const result = await repository.findOne({ filter: { where: { status: 'active' } } });
      expect(result).toEqual({ id: '1', title: 'A' });

      const [call] = dataSource.fakeDriver.searchCalls;
      expect((call.params as Record<string, unknown>)['per_page']).toBe(1);
    });

    test('returns null when there are no hits', async () => {
      dataSource.fakeDriver.searchResponse = { found: 0, hits: [] };

      const result = await repository.findOne({ filter: { where: { status: 'active' } } });
      expect(result).toBeNull();
    });
  });

  describe('count', () => {
    test('reads found and issues per_page: 0', async () => {
      dataSource.fakeDriver.searchResponse = { found: 5, hits: [] };

      const result = await repository.count({ where: { status: 'active' } });
      expect(result).toEqual({ count: 5 });

      const [call] = dataSource.fakeDriver.searchCalls;
      expect((call.params as Record<string, unknown>)['per_page']).toBe(0);
    });
  });

  describe('existsWith', () => {
    test('true when count > 0', async () => {
      dataSource.fakeDriver.searchResponse = { found: 3, hits: [] };
      expect(await repository.existsWith({ where: { status: 'active' } })).toBe(true);
    });

    test('false when count is 0', async () => {
      dataSource.fakeDriver.searchResponse = { found: 0, hits: [] };
      expect(await repository.existsWith({ where: { status: 'active' } })).toBe(false);
    });
  });

  describe('findById', () => {
    test('returns the document when found - delegates to findOne/search (postgres parity)', async () => {
      dataSource.fakeDriver.searchResponse = {
        found: 1,
        hits: [{ document: { id: '1', title: 'A' } }],
      };

      const result = await repository.findById({ id: '1' });
      expect(result).toEqual({ id: '1', title: 'A' });

      const [call] = dataSource.fakeDriver.searchCalls;
      const params = call.params as Record<string, unknown>;
      expect(params['filter_by']).toBe('(isActive:=true && id:=`1`)');
      expect(params['exclude_fields']).toBe('secret');
    });

    test('no hits resolves to null (genuinely missing document)', async () => {
      const result = await repository.findById({ id: 'missing' });
      expect(result).toBeNull();
    });

    test('a defaultFilter-excluded (soft-deleted) document resolves to null', async () => {
      // The fake driver doesn't filter; this asserts the wire query carries defaultWhere AND-merged with the id lookup, which is what makes a real engine exclude it.
      dataSource.fakeDriver.searchResponse = { found: 0, hits: [] };

      const result = await repository.findById({ id: 'soft-deleted' });
      expect(result).toBeNull();

      const [call] = dataSource.fakeDriver.searchCalls;
      const params = call.params as Record<string, unknown>;
      expect(params['filter_by']).toBe('(isActive:=true && id:=`soft-deleted`)');
    });

    test('shouldSkipDefaultFilter bypasses the default filter', async () => {
      dataSource.fakeDriver.searchResponse = {
        found: 1,
        hits: [{ document: { id: '1', title: 'A' } }],
      };

      await repository.findById({ id: '1', options: { shouldSkipDefaultFilter: true } });

      const [call] = dataSource.fakeDriver.searchCalls;
      const params = call.params as Record<string, unknown>;
      expect(params['filter_by']).toBe('id:=`1`');
    });

    test('propagates errors from the underlying search', async () => {
      dataSource.fakeDriver.search = async () => {
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
    test('is a raw passthrough - no dialect translation, no default filter', async () => {
      dataSource.fakeDriver.searchResponse = { found: 0, hits: [] };

      // eslint-disable-next-line @typescript-eslint/naming-convention -- Typesense wire field name
      const params = { q: 'shoes', query_by: 'title' };
      const result = await repository.search({ params });

      expect(result).toEqual({ found: 0, hits: [] });

      const [call] = dataSource.fakeDriver.searchCalls;
      expect(call.collection).toBe('products');
      expect(call.params).toBe(params);
    });

    test('forwards options through to the driver', async () => {
      const params = { q: '*' };
      const options = { cacheSearchResultsForSeconds: 60 };

      await repository.search({ params, options });

      const [call] = dataSource.fakeDriver.searchCalls;
      expect(call.options).toBe(options);
    });
  });

  describe('TInferSearchDocument ergonomics', () => {
    test('find() resolves the compile-time-inferred document shape end to end', async () => {
      const typedRepository = new ReadableSearchRepository<TProductWithDefaultLimitDocument>(
        dataSource,
        { entityClass: ProductDocumentWithDefaultLimit },
      );

      dataSource.fakeDriver.searchResponse = {
        found: 1,
        hits: [{ document: { id: '1', title: 'Widget' } }],
      };

      const [result] = await typedRepository.find({ filter: { where: { title: 'Widget' } } });

      // `result.title` type-checks as `string` purely from `TInferSearchDocument<...schema>` -
      // no hand-written document interface anywhere in this file.
      expect(result.title.toUpperCase()).toBe('WIDGET');
      expect(result).toEqual({ id: '1', title: 'Widget' });
    });
  });
});

describe('search - generic result typing', () => {
  test('default TResult is ISearchResult-shaped; explicit override is honored', async () => {
    const dataSource = new FakeSearchDataSource({ name: 'search-generic-ds', config: {} });
    const repository = new ReadableSearchRepository(dataSource, { entityClass: ProductDocument });
    dataSource.fakeDriver.searchResponse = { found: 1, hits: [{ document: { id: '1' } }] };

    const defaultTyped = await repository.search({ params: { q: '*' } });
    // Compile-time pin: hits/document are reachable without a cast.
    const hitDocument: object | undefined = defaultTyped.hits?.[0]?.document;
    expect(hitDocument).toEqual({ id: '1' });
    expect(defaultTyped.found).toBe(1);

    // eslint-disable-next-line @typescript-eslint/naming-convention -- Typesense wire field name
    type TGroupedResult = { grouped_hits: Array<{ hits: unknown[] }> };
    const overridden: Promise<TGroupedResult> = repository.search<TGroupedResult>({
      params: { q: '*' },
    });
    await overridden;
  });
});
