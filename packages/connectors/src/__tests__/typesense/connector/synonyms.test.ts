import { describe, test, expect } from 'bun:test';
import { makeHelper } from './fake-client';

describe('TypesenseConnector synonym sets', () => {
  test('upsertSynonymSet upserts items (multi-way, no root) via synonymSets(name).upsert', async () => {
    const { helper, fake } = makeHelper();

    await helper.upsertSynonymSet({
      name: 'products_synonyms',
      items: [{ id: 'shoe', synonyms: ['shoe', 'sneaker', 'footwear'] }],
    });

    const call = fake.calls.find(c => c.op === 'synonymSets.upsert');
    expect(call?.args).toEqual([
      'products_synonyms',
      { items: [{ id: 'shoe', synonyms: ['shoe', 'sneaker', 'footwear'] }] },
    ]);
  });

  test('upsertSynonymSet forwards root for one-way items', async () => {
    const { helper, fake } = makeHelper();

    await helper.upsertSynonymSet({
      name: 'products_synonyms',
      items: [{ id: 'shoe-oneway', synonyms: ['sneaker'], root: 'shoe' }],
    });

    const call = fake.calls.find(c => c.op === 'synonymSets.upsert');
    expect(call?.args).toEqual([
      'products_synonyms',
      { items: [{ id: 'shoe-oneway', synonyms: ['sneaker'], root: 'shoe' }] },
    ]);
  });

  test('getSynonymSet maps the set items to ISynonym[], null when missing (404)', async () => {
    const present = makeHelper({
      synonymSetByName: {
        ['products_synonyms']: {
          name: 'products_synonyms',
          items: [
            { id: 'shoe', synonyms: ['shoe', 'sneaker'] },
            { id: 'shoe-oneway', synonyms: ['sneaker'], root: 'shoe' },
          ],
        },
      },
    });
    expect(await present.helper.getSynonymSet({ name: 'products_synonyms' })).toEqual([
      { id: 'shoe', synonyms: ['shoe', 'sneaker'] },
      { id: 'shoe-oneway', synonyms: ['sneaker'], root: 'shoe' },
    ]);

    const absent = makeHelper({ throwOn: { 'synonymSets.retrieve': { httpStatus: 404 } } });
    expect(await absent.helper.getSynonymSet({ name: 'nope' })).toBeNull();
  });

  test('listSynonymSets returns the set names', async () => {
    const { helper, fake } = makeHelper({
      synonymSetsList: [{ name: 'products_synonyms' }, { name: 'brands_synonyms' }],
    });

    const result = await helper.listSynonymSets();

    expect(fake.calls.some(c => c.op === 'synonymSets.retrieve')).toBe(true);
    expect(result).toEqual(['products_synonyms', 'brands_synonyms']);
  });

  test('listSynonymSets returns an empty array when there are none', async () => {
    const { helper } = makeHelper();
    expect(await helper.listSynonymSets()).toEqual([]);
  });

  test('deleteSynonymSet returns true on success, false on 404', async () => {
    const ok = makeHelper();
    expect(await ok.helper.deleteSynonymSet({ name: 'products_synonyms' })).toBe(true);

    const missing = makeHelper({ throwOn: { 'synonymSets.delete': { httpStatus: 404 } } });
    expect(await missing.helper.deleteSynonymSet({ name: 'nope' })).toBe(false);
  });

  test('linkSynonymSets patches the collection with synonym_sets', async () => {
    const { helper, fake } = makeHelper();

    await helper.linkSynonymSets({ collection: 'products', synonymSets: ['products_synonyms'] });

    const call = fake.calls.find(c => c.op === 'collections.update');
    expect(call?.args).toEqual(['products', { ['synonym_sets']: ['products_synonyms'] }]);
  });
});
