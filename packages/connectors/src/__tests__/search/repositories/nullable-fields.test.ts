import { describe, expect, test } from 'bun:test';
import { model } from '@venizia/ignis-kernel';
import { BaseSearchEntity, field, SearchCollectionFactory } from '@/search/core/models';
import { PersistableSearchRepository } from '@/search/typesense/repositories';
import { MeilisearchDataSource } from '@/search/meilisearch';
import { MeilisearchConnector } from '@/search/meilisearch/connector';
import { FakeMeilisearchClient } from '../../meilisearch/connector/fake-client';
import { ReadableSearchRepository } from '@/search/core/repositories';
import { FakeSearchDataSource } from './fake-search-connector';

/**
 * Typesense keeps no null: a field written as null comes back without its key. A field declared
 * `{ optional: true, nullable: true }` is returned as null when the key is absent, so a document
 * matches the shape the model declares. A plain optional field stays absent.
 */
@model({
  type: 'entity',
  tableName: 'nullable_documents',
  settings: { hiddenProperties: ['secret'] },
})
class NullableDocument extends BaseSearchEntity {
  static override schema = SearchCollectionFactory.define({
    name: 'nullable_documents',
    fields: [
      field.string('title', { searchable: true }),
      field.string('note', { optional: true, nullable: true }),
      field.number('rating', { optional: true, nullable: true }),
      field.string('nickname', { optional: true }),
      field.string('secret', { optional: true, nullable: true }),
    ],
  });
}

const build = (opts: { hits?: Array<Record<string, unknown>> } = {}) => {
  const dataSource = new FakeSearchDataSource({ name: 'nullable-ds', config: {} });
  const hits = opts.hits ?? [];

  dataSource.fakeConnector.searchResponse = {
    found: hits.length,
    isFoundExact: true,
    hits: hits.map((document) => ({ document })),
  };

  const repository = new PersistableSearchRepository(dataSource, {
    entityClass: NullableDocument,
  });

  return { dataSource, repository };
};

/** What Typesense hands back for a document written with `note: null` and `rating: null`. */
const STORED = { id: '1', title: 'Lamp' };

describe('a nullable field reads back as null when the engine dropped the key', () => {
  test('find() fills note and rating, leaves the plain optional field absent', async () => {
    const { repository } = build({ hits: [STORED] });

    const [row] = await repository.find({ filter: {} });

    expect(row).toEqual({ id: '1', title: 'Lamp', note: null, rating: null });
    expect(row).not.toHaveProperty('nickname');
  });

  test('findOne() and findById() fill it too', async () => {
    const { repository } = build({ hits: [STORED] });

    const result2 = await repository.findOne({ filter: {} });
    expect(result2).toMatchObject({ note: null, rating: null });
    const result3 = await repository.findById({ id: '1' });
    expect(result3).toMatchObject({ note: null, rating: null });
  });

  test('search() fills the hits in keyword mode', async () => {
    const { repository } = build({ hits: [STORED] });

    const result = await repository.search({ mode: 'keyword', query: 'lamp' });

    expect(result.hits?.[0].document).toEqual({ id: '1', title: 'Lamp', note: null, rating: null });
  });

  test('suggest() fills the documents', async () => {
    const { repository } = build({ hits: [STORED] });

    const documents = await repository.suggest({ query: 'la', queryBy: ['title'] });

    expect(documents[0]).toMatchObject({ note: null, rating: null });
  });

  test('a value the engine returned is kept, and so is a null', async () => {
    const { repository } = build({
      hits: [{ id: '1', title: 'Lamp', note: 'warm', rating: null, nickname: 'L' }],
    });

    const [row] = await repository.find({ filter: {} });

    expect(row).toEqual({ id: '1', title: 'Lamp', note: 'warm', rating: null, nickname: 'L' });
  });

  test('a falsy value is kept: 0 and the empty string are not absent', async () => {
    const { repository } = build({
      hits: [{ id: '1', title: 'Lamp', note: '', rating: 0 }],
    });

    const [row] = await repository.find({ filter: {} });

    expect(row).toMatchObject({ note: '', rating: 0 });
  });

  test('a hidden nullable field stays hidden', async () => {
    const { repository } = build({ hits: [{ ...STORED, secret: 'LEAKED' }] });

    const [row] = await repository.find({ filter: {} });

    expect(row).not.toHaveProperty('secret');
    expect(JSON.stringify(row)).not.toContain('LEAKED');
  });

  test('the document the engine returned is not mutated', async () => {
    const { dataSource, repository } = build({ hits: [{ ...STORED }] });

    await repository.find({ filter: {} });

    const [hit] = dataSource.fakeConnector.searchResponse.hits ?? [];
    expect(hit.document).toEqual(STORED);
  });

  test('raw mode is a passthrough: nothing is filled', async () => {
    const { repository } = build({ hits: [STORED] });

    const result = await repository.search({ mode: 'raw', params: { q: '*' } });

    expect(result.hits?.[0].document).toEqual(STORED);
  });
});

describe('a field selection limits the fill to the selected fields', () => {
  test('find() with fields fills only the nullable fields in the selection', async () => {
    const { repository } = build({ hits: [STORED] });

    const [onlyTitle] = await repository.find({ filter: { fields: ['title'] } });
    const [withNote] = await repository.find({ filter: { fields: ['title', 'note'] } });
    const [objectForm] = await repository.find({
      filter: { fields: { title: true, rating: true } },
    });

    expect(onlyTitle).toEqual({ id: '1', title: 'Lamp' });
    expect(withNote).toEqual({ id: '1', title: 'Lamp', note: null });
    expect(objectForm).toEqual({ id: '1', title: 'Lamp', rating: null });
  });

  test('search() with fields does the same for its hits', async () => {
    const { repository } = build({ hits: [STORED] });

    const result = await repository.search({
      mode: 'keyword',
      query: 'lamp',
      filter: { fields: ['title', 'note'] },
    });

    expect(result.hits?.[0].document).toEqual({ id: '1', title: 'Lamp', note: null });
  });

  test('suggest() with includeFields does the same', async () => {
    const { repository } = build({ hits: [STORED] });

    const documents = await repository.suggest({
      query: 'la',
      queryBy: ['title'],
      includeFields: ['title'],
    });

    expect(documents[0]).toEqual({ id: '1', title: 'Lamp' });
  });

  test('an empty selection is no selection, as the engine reads it', async () => {
    const { repository } = build({ hits: [STORED] });

    const [row] = await repository.find({ filter: { fields: [] } });

    expect(row).toMatchObject({ note: null, rating: null });
  });
});

/** Meilisearch keeps nulls, but the fill lives in the engine-neutral repository: one behaviour on both engines, a nullable field always reads as `T | null`. */
describe('on Meilisearch a nullable field also reads as null when it was never set', () => {
  test('find() fills note and rating, leaves the plain optional field absent', async () => {
    const connector = new MeilisearchConnector({
      name: 'nullable-meili',
      host: 'http://localhost:7700',
      taskIntervalMs: 1,
      client: new FakeMeilisearchClient(),
    });
    await connector.collection.ensure({
      schema: { uid: 'nullable_documents', primaryKey: 'id', settings: {} },
    });
    await connector.document.create({ collection: 'nullable_documents', document: { ...STORED } });

    const dataSource = new MeilisearchDataSource({
      name: 'nullable-meili-ds',
      config: { host: 'http://localhost:7700' },
      connector,
    });
    await dataSource.configure();
    const repository = new ReadableSearchRepository(dataSource, { entityClass: NullableDocument });

    const [row] = await repository.find({ filter: {} });

    expect(row).toEqual({ id: '1', title: 'Lamp', note: null, rating: null });
    expect(row).not.toHaveProperty('nickname');
  });
});

describe('a write response has the same shape as a read', () => {
  test('create() fills the nullable fields and still sends the document as given', async () => {
    const { dataSource, repository } = build();
    const data = { title: 'Lamp' };

    const result = await repository.create({ data });

    expect(result.data).toEqual({ title: 'Lamp', note: null, rating: null });
    expect(dataSource.fakeConnector.createDocumentCalls[0].document).toBe(data);
    expect(data).toEqual({ title: 'Lamp' });
  });

  test('createAll() fills every created document', async () => {
    const { dataSource, repository } = build();
    dataSource.fakeConnector.importDocumentsResponse = {
      count: { success: 2, fail: 0 },
      responses: [],
    };

    const result = await repository.createAll({ data: [{ title: 'A' }, { title: 'B' }] });

    expect(result.data).toHaveLength(2);
    for (const document of result.data) {
      expect(document).toMatchObject({ note: null, rating: null });
    }
  });

  test('updateById() fills the updated document', async () => {
    const { repository } = build({ hits: [STORED] });

    const result = await repository.updateById({ id: '1', data: { title: 'Desk' } });

    expect(result.data).toEqual({ title: 'Desk', note: null, rating: null });
  });
});
