import { describe, expect, test } from 'bun:test';
import { model, type TFilter } from '@venizia/ignis-kernel';
import { isApplicationError } from '@venizia/ignis-helpers/core';
import { BaseSearchEntity, field, SearchCollectionFactory } from '@/search/core/models';
import { ReadableSearchRepository } from '@/search/core/repositories';
import { SearchModes } from '@/search/core/repositories/common';
import { MeilisearchDataSource } from '@/search/meilisearch';
import { MeilisearchConnector } from '@/search/meilisearch/connector';
import { FakeMeilisearchClient } from '../meilisearch/connector/fake-client';
import { FakeSearchDataSource } from './repositories/fake-search-connector';

/**
 * A request filter that names a hidden field is refused exactly as the same filter with a missing name in its place: the
 * refusal is the first one the query itself meets, in the order it reads the filter, on both engines. The query reads `include`,
 * then the `order` entries, then the `where` keys in object order.
 */
@model({
  type: 'entity',
  tableName: 'first_refusal_documents',
  settings: { hiddenProperties: ['secret'] },
})
class FirstRefusalDocument extends BaseSearchEntity {
  static override schema = SearchCollectionFactory.define({
    name: 'first_refusal_documents',
    fields: [
      field.string('title', { searchable: true }),
      field.string('status'),
      field.string('secret', { optional: true }),
    ],
  });
}

type TRepository = ReadableSearchRepository;

let sequence = 0;

const typesense = (): { repository: TRepository; engineCalls: () => number } => {
  sequence += 1;
  const dataSource = new FakeSearchDataSource({ name: `first-refusal-ts-${sequence}`, config: {} });

  return {
    repository: new ReadableSearchRepository(dataSource, {
      entityClass: FirstRefusalDocument,
    }),
    engineCalls: () => dataSource.fakeConnector.searchCalls.length,
  };
};

const meilisearch = async (): Promise<{ repository: TRepository; engineCalls: () => number }> => {
  sequence += 1;
  const client = new FakeMeilisearchClient();
  const connector = new MeilisearchConnector({
    name: `first-refusal-meili-${sequence}`,
    host: 'http://localhost:7700',
    taskIntervalMs: 1,
    client,
  });

  await connector.collection.ensure({
    schema: { uid: 'first_refusal_documents', primaryKey: 'id', settings: {} },
  });

  const dataSource = new MeilisearchDataSource({
    name: `first-refusal-meili-ds-${sequence}`,
    config: { host: 'http://localhost:7700' },
    connector,
  });

  await dataSource.configure();

  return {
    repository: new ReadableSearchRepository(dataSource, { entityClass: FirstRefusalDocument }),
    engineCalls: () => client.searchCalls.length,
  };
};

const ENGINES = [
  ['Typesense', async () => typesense()],
  ['Meilisearch', meilisearch],
] as const;

const guardRefusal = (repository: TRepository, filter: object) => {
  try {
    repository.assertRequestFilter({ filter });
  } catch (error) {
    if (isApplicationError(error)) {
      return error;
    }

    throw error;
  }

  throw new Error('expected the guard to refuse the filter');
};

const queryRefusal = async (repository: TRepository, filter: TFilter) => {
  try {
    await repository.search({
      mode: SearchModes.KEYWORD,
      query: 'a',
      queryBy: ['title'],
      filter,
    });
  } catch (error) {
    if (isApplicationError(error)) {
      return error;
    }

    throw error;
  }

  throw new Error('expected the query to refuse the filter');
};

const renamed = (filter: object, from: string, to: string): TFilter =>
  JSON.parse(JSON.stringify(filter).replaceAll(from, to));

describe.each(ENGINES)('%s', (_engine, make) => {
  test('an order on a field the collection does not declare is refused before the engine, worded as a hidden one is', async () => {
    const { repository, engineCalls } = await make();

    const hidden = guardRefusal(repository, { order: ['secret DESC'] });
    const missing = await queryRefusal(repository, { order: ['nope DESC'] });

    expect(engineCalls()).toBe(0);
    expect(missing.statusCode).toBe(400);
    expect(hidden.statusCode).toBe(missing.statusCode);
    expect(hidden.message).toBe(missing.message.replaceAll('nope', 'secret'));
  });

  /** Each filter names `secret` (hidden) and `nope` (missing); the control puts the missing `zzz` where `secret` was. */
  test.each([
    ['a missing where key before the hidden one', { where: { nope: 1, secret: 1 } }, 'nope'],
    ['the hidden where key before a missing one', { where: { secret: 1, nope: 1 } }, 'secret'],
    [
      'a missing key in an or before the hidden one',
      { where: { or: [{ nope: 1 }], secret: 1 } },
      'nope',
    ],
    ['a missing order entry before the hidden one', { order: ['nope ASC', 'secret DESC'] }, 'nope'],
    [
      'a missing order entry, the hidden field in the where',
      { where: { secret: 1 }, order: ['nope ASC'] },
      'nope',
    ],
    [
      'a missing where key, the hidden field in the order: the order is read first',
      { where: { nope: 1 }, order: ['secret DESC'] },
      'secret',
    ],
  ])('%s', async (_name, filter, named) => {
    const { repository } = await make();

    const hidden = guardRefusal(repository, filter);
    const missing = await queryRefusal(repository, renamed(filter, 'secret', 'zzz'));

    expect(missing.message).toContain(named === 'secret' ? 'zzz' : named);
    expect(hidden.statusCode).toBe(missing.statusCode);
    expect(hidden.message).toBe(missing.message.replaceAll('zzz', 'secret'));
  });

  test('an include, which no search query reads, is refused before a hidden field', async () => {
    const { repository } = await make();
    const filter = { include: [{ relation: 'tags' }], where: { secret: 1 } };

    const hidden = guardRefusal(repository, filter);
    const missing = await queryRefusal(repository, renamed(filter, 'secret', 'zzz'));

    expect(missing.message).toContain('include');
    expect(hidden.message).toBe(missing.message);
  });

  test('a filter with a missing name and no hidden one is left to the query, which refuses it itself', async () => {
    const { repository } = await make();

    expect(() =>
      repository.assertRequestFilter({ filter: { where: { nope: 1 }, order: ['zzz ASC'] } }),
    ).not.toThrow();
  });

  test('a filter on visible fields passes and reaches the engine', async () => {
    const { repository, engineCalls } = await make();
    const filter = { where: { status: 'a', or: [{ title: 'b' }] }, order: ['title ASC'] };

    expect(() => repository.assertRequestFilter({ filter })).not.toThrow();

    await repository.search({
      mode: SearchModes.KEYWORD,
      query: 'a',
      queryBy: ['title'],
      filter,
    });

    expect(engineCalls()).toBe(1);
  });
});

describe('Meilisearch', () => {
  test('a dotted where key, refused before any field is looked up, comes before a hidden field', async () => {
    const { repository } = await meilisearch();
    const filter = { where: { 'meta.x': 1, secret: 1 } };

    const hidden = guardRefusal(repository, filter);
    const missing = await queryRefusal(repository, renamed(filter, 'secret', 'zzz'));

    expect(missing.message).toContain('JSON-path');
    expect(hidden.message).toBe(missing.message);
  });
});
