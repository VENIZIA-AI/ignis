import { describe, test, expect } from 'bun:test';
import { makeHelper } from './fake-client';

describe('TypesenseConnector synonyms', () => {
  test('upsertSynonym calls collections(name).synonyms().upsert and maps the response back to ISynonym (multi-way, no root)', async () => {
    const { helper, fake } = makeHelper();

    const result = await helper.upsertSynonym({
      collection: 'products',
      synonym: { id: 'shoe-synonyms', synonyms: ['shoe', 'sneaker', 'footwear'] },
    });

    const call = fake.calls.find(c => c.op === 'synonyms.upsert');
    expect(call?.args).toEqual([
      'products',
      'shoe-synonyms',
      { synonyms: ['shoe', 'sneaker', 'footwear'] },
    ]);
    expect(result).toEqual({ id: 'shoe-synonyms', synonyms: ['shoe', 'sneaker', 'footwear'] });
  });

  test('upsertSynonym forwards root for a one-way synonym', async () => {
    const { helper, fake } = makeHelper();

    const result = await helper.upsertSynonym({
      collection: 'products',
      synonym: { id: 'shoe-oneway', synonyms: ['sneaker'], root: 'shoe' },
    });

    const call = fake.calls.find(c => c.op === 'synonyms.upsert');
    expect(call?.args).toEqual([
      'products',
      'shoe-oneway',
      { synonyms: ['sneaker'], root: 'shoe' },
    ]);
    expect(result).toEqual({ id: 'shoe-oneway', synonyms: ['sneaker'], root: 'shoe' });
  });

  test('getSynonym maps the wire shape to ISynonym, null when missing (404)', async () => {
    const present = makeHelper({
      synonymById: { 'shoe-synonyms': { id: 'shoe-synonyms', synonyms: ['shoe', 'sneaker'] } },
    });
    expect(
      await present.helper.getSynonym({ collection: 'products', id: 'shoe-synonyms' }),
    ).toEqual({ id: 'shoe-synonyms', synonyms: ['shoe', 'sneaker'] });

    const absent = makeHelper({ throwOn: { 'synonyms.retrieve': { httpStatus: 404 } } });
    expect(await absent.helper.getSynonym({ collection: 'products', id: 'nope' })).toBeNull();
  });

  test('listSynonyms returns the full synonym set for a collection', async () => {
    const { helper, fake } = makeHelper({
      synonymsList: [
        { id: 'shoe-synonyms', synonyms: ['shoe', 'sneaker'] },
        { id: 'shoe-oneway', synonyms: ['sneaker'], root: 'shoe' },
      ],
    });

    const result = await helper.listSynonyms({ collection: 'products' });

    expect(fake.calls.some(c => c.op === 'synonyms.retrieve')).toBe(true);
    expect(result).toEqual([
      { id: 'shoe-synonyms', synonyms: ['shoe', 'sneaker'] },
      { id: 'shoe-oneway', synonyms: ['sneaker'], root: 'shoe' },
    ]);
  });

  test('listSynonyms returns an empty array when the collection has none', async () => {
    const { helper } = makeHelper();
    expect(await helper.listSynonyms({ collection: 'products' })).toEqual([]);
  });

  test('deleteSynonym returns true on success, false on 404', async () => {
    const ok = makeHelper();
    expect(await ok.helper.deleteSynonym({ collection: 'products', id: 'shoe-synonyms' })).toBe(
      true,
    );

    const missing = makeHelper({ throwOn: { 'synonyms.delete': { httpStatus: 404 } } });
    expect(await missing.helper.deleteSynonym({ collection: 'products', id: 'nope' })).toBe(false);
  });
});
