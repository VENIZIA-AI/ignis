import { describe, expect, test } from 'bun:test';
import type { AnyType } from '@venizia/ignis-helpers/common';
import { model } from '@venizia/ignis-kernel';
import { BaseSearchEntity, field, SearchCollectionFactory } from '@/search/core/models';
import { PersistableSearchRepository } from '@/search/typesense/repositories';
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
  }) as AnyType;

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

    expect(result.hits[0].document).toEqual({ id: '1', title: 'Lamp', note: null, rating: null });
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

    expect(result.hits[0].document).toEqual(STORED);
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
