import { beforeEach, describe, expect, test } from 'bun:test';
import type { AnyType } from '@venizia/ignis-helpers';
import { RetryBackoffStrategies, RetryJitterModes } from '@venizia/ignis-helpers';

import type { ISearchResult } from '@/connectors/search';
import { ReadableSearchRepository } from '@/connectors/typesense/repositories';
import { FakeSearchDataSource, ProductDocument } from './fake-search-connector';

const FAST_RETRY_BACKOFF = {
  strategy: RetryBackoffStrategies.FIXED,
  initialDelayMs: 1,
  jitter: RetryJitterModes.NONE,
} as const;

const EMPTY_RESPONSE: ISearchResult = { found: 0, isFoundExact: true, hits: [] };
const HIT_RESPONSE: ISearchResult = {
  found: 1,
  isFoundExact: true,
  hits: [{ document: { id: '1', title: 'A' } }],
};

describe('search readable retry wiring', () => {
  let dataSource: FakeSearchDataSource;
  let repository: ReadableSearchRepository;

  beforeEach(() => {
    dataSource = new FakeSearchDataSource({ name: 'read-retry-search-ds', config: {} });
    repository = new ReadableSearchRepository(dataSource, { entityClass: ProductDocument });
  });

  test('find retries until hits appear', async () => {
    dataSource.fakeConnector.searchResponses = [EMPTY_RESPONSE, HIT_RESPONSE];

    const results = await repository.find({
      filter: {},
      options: { retry: { maxAttempts: 3, backoff: FAST_RETRY_BACKOFF } },
    });

    expect(results).toEqual([{ id: '1', title: 'A' }]);
    expect(dataSource.fakeConnector.searchCalls.length).toBe(2);
  });

  test('findOne carries exactly ONE retry layer through its find delegation', async () => {
    dataSource.fakeConnector.searchResponses = [EMPTY_RESPONSE, HIT_RESPONSE];

    const result = await repository.findOne({
      filter: {},
      options: { retry: { maxAttempts: 3, backoff: FAST_RETRY_BACKOFF } },
    });

    expect(result).toEqual({ id: '1', title: 'A' });
    // One search per attempt - retry never stacks between findOne and find.
    expect(dataSource.fakeConnector.searchCalls.length).toBe(2);
  });

  test('without retry the behavior is untouched - single search call', async () => {
    const results = await repository.find({ filter: {} });

    expect(results).toEqual([]);
    expect(dataSource.fakeConnector.searchCalls.length).toBe(1);
  });

  test('exhaustion returns the last empty result instead of throwing', async () => {
    dataSource.fakeConnector.searchResponses = [EMPTY_RESPONSE, EMPTY_RESPONSE];

    const results = await repository.find({
      filter: {},
      options: { retry: { maxAttempts: 2, backoff: FAST_RETRY_BACKOFF } },
    });

    expect(results).toEqual([]);
    expect(dataSource.fakeConnector.searchCalls.length).toBe(2);
  });

  test('a transaction is rejected even on the retry path - no search is issued', async () => {
    dataSource.fakeConnector.searchResponses = [EMPTY_RESPONSE, HIT_RESPONSE];
    let caught: unknown;

    try {
      await repository.find({
        filter: {},
        options: {
          transaction: {} as AnyType,
          retry: { maxAttempts: 3, backoff: FAST_RETRY_BACKOFF },
        },
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeDefined();
    expect(dataSource.fakeConnector.searchCalls.length).toBe(0);
  });

  test('findById with retry re-reads until the document appears', async () => {
    dataSource.fakeConnector.searchResponses = [EMPTY_RESPONSE, HIT_RESPONSE];

    const result = await repository.findById({
      id: '1',
      options: { retry: { maxAttempts: 3, backoff: FAST_RETRY_BACKOFF } },
    });

    expect(result).toEqual({ id: '1', title: 'A' });
    expect(dataSource.fakeConnector.searchCalls.length).toBe(2);
  });
});
