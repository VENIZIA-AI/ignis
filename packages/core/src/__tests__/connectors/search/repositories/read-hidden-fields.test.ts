import { describe, expect, test } from 'bun:test';
import type { AnyType } from '@venizia/ignis-helpers/common';
import { ReadableSearchRepository } from '@/connectors/search/repositories';
import { FakeSearchDataSource, ProductDocument } from './fake-search-connector';

/** The engine is not the last line of defence for `hiddenProperties`: Meilisearch has NO per-query exclusion, so the READ path strips them in JS just like the WRITE path (`omitHiddenFields`) - a hidden field must never leave the repository, whatever the engine or index settings. */
const buildRepository = (opts: {
  hiddenFields: string[];
  hits: Array<Record<string, unknown>>;
}) => {
  const dataSource = new FakeSearchDataSource({ name: 'hidden-read-ds', config: {} });

  dataSource.fakeConnector.searchResponse = {
    found: opts.hits.length,
    isFoundExact: true,
    hits: opts.hits.map(document => ({ document })),
  };

  const repository = new ReadableSearchRepository(dataSource, { entityClass: ProductDocument });

  // Stand in for the `@model({ settings: { hiddenProperties } })` the entity would carry.
  Object.defineProperty(repository, 'hiddenFields', { get: () => opts.hiddenFields });

  return repository as AnyType;
};

describe('a hidden field never leaves the read path', () => {
  test('find() strips it from every document, even if the engine returned it', () => {
    const repository = buildRepository({
      hiddenFields: ['password'],
      hits: [
        { id: '1', name: 'a', password: 'LEAKED' },
        { id: '2', name: 'b', password: 'LEAKED' },
      ],
    });

    return repository.find({ filter: {} }).then((rows: AnyType[]) => {
      expect(JSON.stringify(rows)).not.toContain('LEAKED');
      expect(rows[0].name).toBe('a');
    });
  });

  test('findOne() strips it', async () => {
    const repository = buildRepository({
      hiddenFields: ['password'],
      hits: [{ id: '1', name: 'a', password: 'LEAKED' }],
    });

    const row = await repository.findOne({ filter: {} });

    expect(JSON.stringify(row)).not.toContain('LEAKED');
  });

  test('search() in keyword mode strips it from the hits', async () => {
    const repository = buildRepository({
      hiddenFields: ['password'],
      hits: [{ id: '1', name: 'a', password: 'LEAKED' }],
    });

    const result = await repository.search({ mode: 'keyword', query: 'a' });

    expect(JSON.stringify(result.hits)).not.toContain('LEAKED');
  });

  test('a document with no hidden field is untouched', async () => {
    const repository = buildRepository({
      hiddenFields: [],
      hits: [{ id: '1', name: 'a' }],
    });

    const rows = await repository.find({ filter: {} });

    expect(rows).toEqual([{ id: '1', name: 'a' }]);
  });
});
