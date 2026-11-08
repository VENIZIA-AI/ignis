import { describe, expect, test } from 'bun:test';
import { model } from '@venizia/ignis-kernel';
import { BaseSearchEntity, field, SearchCollectionFactory } from '@/search/core/models';
import { ReadableSearchRepository } from '@/search/core/repositories';
import { MeilisearchDataSource } from '@/search/meilisearch';
import { MeilisearchConnector } from '@/search/meilisearch/connector';
import { MeilisearchQueryDialect } from '@/search/meilisearch/repositories/dialect/query-dialect';
import { FakeMeilisearchClient } from '../../meilisearch/connector/fake-client';
import { FakeSearchDataSource } from './fake-search-connector';
import { PersistableSearchRepository } from '@/search/typesense/repositories';

/**
 * A highlight is built from the document's own fields, so it loses the hidden fields the document loses, on every engine. On
 * Meilisearch the engine is also asked for the visible fields only: `_formatted` holds every retrieved attribute.
 */
@model({
  type: 'entity',
  tableName: 'highlight_documents',
  settings: { properties: { hidden: ['secret'] } },
})
class HighlightDocument extends BaseSearchEntity {
  static override schema = SearchCollectionFactory.define({
    name: 'highlight_documents',
    fields: [
      field.string('title', { searchable: true }),
      field.string('note', { optional: true }),
      field.string('secret', { optional: true }),
    ],
  });
}

const STORED = { id: '1', title: 'foo lamp', note: 'n', secret: 'S3CRET' };

const buildMeilisearch = async () => {
  const client = new FakeMeilisearchClient();
  const connector = new MeilisearchConnector({
    name: 'highlight-meili',
    host: 'http://localhost:7700',
    taskIntervalMs: 1,
    client,
  });
  await connector.collection.ensure({
    schema: { uid: 'highlight_documents', primaryKey: 'id', settings: {} },
  });
  await connector.document.create({ collection: 'highlight_documents', document: { ...STORED } });

  const dataSource = new MeilisearchDataSource({
    name: 'highlight-meili-ds',
    config: { host: 'http://localhost:7700' },
    connector,
  });
  await dataSource.configure();

  return {
    client,
    repository: new ReadableSearchRepository(dataSource, { entityClass: HighlightDocument }),
  };
};

describe('Meilisearch: a highlight carries no hidden field', () => {
  test('keyword search with highlightFields returns the highlight without `secret`', async () => {
    const { repository } = await buildMeilisearch();

    const result = await repository.search({
      mode: 'keyword',
      query: 'foo',
      queryBy: ['title'],
      highlightFields: ['title'],
    });
    const [hit] = result.hits ?? [];

    expect(hit.document).not.toHaveProperty('secret');
    expect(hit.highlight).toBeDefined();
    expect(hit.highlight).not.toHaveProperty('secret');
    expect(JSON.stringify(hit)).not.toContain('S3CRET');
    expect(hit.highlight).toMatchObject({ title: 'foo lamp' });
  });

  test('the engine is asked for the visible fields only, `id` included', async () => {
    const { client, repository } = await buildMeilisearch();

    await repository.search({ mode: 'keyword', query: 'foo', queryBy: ['title'] });

    const params = client.searchCalls.at(-1)?.params as { attributesToRetrieve?: string[] };

    expect(params.attributesToRetrieve?.sort()).toEqual(['id', 'note', 'title']);
  });

  test('a selection that names a hidden field loses it from the engine request, and a selection of visible fields is kept', async () => {
    const { client, repository } = await buildMeilisearch();

    await repository.search({
      mode: 'keyword',
      query: 'foo',
      queryBy: ['title'],
      filter: { fields: ['title', 'secret'] },
    });
    const selected = client.searchCalls.at(-1)?.params as { attributesToRetrieve?: string[] };

    await repository.search({
      mode: 'keyword',
      query: 'foo',
      queryBy: ['title'],
      filter: { fields: ['note'] },
    });
    const kept = client.searchCalls.at(-1)?.params as { attributesToRetrieve?: string[] };

    expect(selected.attributesToRetrieve).toEqual(['title']);
    expect(kept.attributesToRetrieve).toEqual(['note']);
  });

  test('a selection of only a hidden field falls back to the visible fields', async () => {
    const { client, repository } = await buildMeilisearch();

    await repository.search({
      mode: 'keyword',
      query: 'foo',
      queryBy: ['title'],
      filter: { fields: ['secret'] },
    });
    const params = client.searchCalls.at(-1)?.params as { attributesToRetrieve?: string[] };

    expect(params.attributesToRetrieve?.sort()).toEqual(['id', 'note', 'title']);
  });

  test('even an engine that returns every attribute leaves no hidden value in the hit', async () => {
    const { client, repository } = await buildMeilisearch();
    const index = client.index('highlight_documents') as unknown as {
      search: (query: string | null, params?: unknown) => Promise<unknown>;
    };
    const original = index.search.bind(index);

    // An index whose engine ignores attributesToRetrieve (a different version, a proxy): the repository still shapes the hit.
    (client as unknown as { index: () => unknown }).index = () => ({
      ...index,
      search: (query: string | null) => original(query, {}),
    });

    const result = await repository.search({
      mode: 'keyword',
      query: 'foo',
      queryBy: ['title'],
      highlightFields: ['title'],
    });

    expect(JSON.stringify(result.hits)).not.toContain('S3CRET');
  });
});

describe('the dialect', () => {
  const dialect = new MeilisearchQueryDialect();
  const capabilities = { fields: new Set(['title', 'note', 'secret']) };

  test('sends the visible fields when the model hides some and no selection is made', () => {
    const query = dialect.build({ hiddenFields: ['secret'], capabilities });

    expect(query.includeFields).toBe('id,title,note');
  });

  test('sends nothing when the model hides nothing', () => {
    expect(dialect.build({ hiddenFields: [], capabilities }).includeFields).toBeUndefined();
    expect(dialect.build({ capabilities }).includeFields).toBeUndefined();
  });

  test('does not guess when the declared fields are unknown', () => {
    expect(dialect.build({ hiddenFields: ['secret'] }).includeFields).toBeUndefined();
  });

  test('never lists a hidden field, `id` hidden included', () => {
    expect(dialect.build({ hiddenFields: ['id', 'secret'], capabilities }).includeFields).toBe(
      'title,note',
    );
  });
});

describe('Typesense: a highlight is shaped like the document too', () => {
  const buildTypesense = (highlight: unknown) => {
    const dataSource = new FakeSearchDataSource({ name: 'highlight-typesense-ds', config: {} });

    dataSource.fakeConnector.searchResponse = {
      found: 1,
      isFoundExact: true,
      hits: [
        highlight === undefined
          ? { document: { ...STORED } }
          : { document: { ...STORED }, highlight },
      ],
    };

    return new PersistableSearchRepository(dataSource, { entityClass: HighlightDocument });
  };

  test('a record loses its hidden keys', async () => {
    const repository = buildTypesense({
      title: { snippet: '<mark>foo</mark> lamp' },
      secret: { snippet: 'S3CRET' },
    });

    const result = await repository.search({ mode: 'keyword', query: 'foo', queryBy: ['title'] });

    expect(result.hits?.[0].highlight).toEqual({ title: { snippet: '<mark>foo</mark> lamp' } });
  });

  test('a list of entries loses those of a hidden field, a dotted path included', async () => {
    const repository = buildTypesense([
      { field: 'title', snippet: 'a' },
      { field: 'secret', snippet: 'S3CRET' },
      { field: 'secret.inner', snippet: 'S3CRET' },
    ]);

    const result = await repository.search({ mode: 'keyword', query: 'foo', queryBy: ['title'] });

    expect(result.hits?.[0].highlight).toEqual([{ field: 'title', snippet: 'a' }]);
  });

  test('a hit with no highlight stays without one', async () => {
    const repository = buildTypesense(undefined);

    const result = await repository.search({ mode: 'keyword', query: 'foo', queryBy: ['title'] });

    expect(result.hits?.[0]).not.toHaveProperty('highlight');
  });

  test('raw mode stays a passthrough', async () => {
    const repository = buildTypesense({ secret: { snippet: 'S3CRET' } });

    const result = await repository.search({ mode: 'raw', params: { q: '*' } });

    expect(JSON.stringify(result.hits)).toContain('S3CRET');
  });
});
