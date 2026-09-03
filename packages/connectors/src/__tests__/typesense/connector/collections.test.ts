import { describe, test, expect } from 'bun:test';
import { ApplicationError } from '@venizia/ignis-helpers/core';
import { expectRejection } from '@/__tests__/rejection.helper';
import { makeHelper } from './fake-client';

const schema = { name: 'products', fields: [{ name: 'title', type: 'string' as const }] };

describe('TypesenseConnector collections', () => {
  test('createCollection calls collections().create', async () => {
    const { helper, fake } = makeHelper();
    await helper.createCollection({ schema });
    expect(fake.calls.some(c => c.op === 'collections.create')).toBe(true);
  });

  test('createCollection is idempotent (swallows 409)', async () => {
    const { helper } = makeHelper({
      throwOn: { 'collections.create': { httpStatus: 409, message: 'already exists' } },
    });
    // Should NOT throw; returns undefined (void) when collection already exists.
    const result = await helper.createCollection({ schema });
    expect(result).toBeUndefined();
  });

  test('createCollection rethrows (sanitized 503) on real failure', async () => {
    const { helper } = makeHelper({ throwOn: { 'collections.create': new Error('boom') } });
    let status = 0;
    try {
      await helper.createCollection({ schema });
    } catch (e) {
      status = (e as { statusCode: number }).statusCode;
    }
    expect(status).toBe(503);
  });

  test('ensureCollection returns existing when present', async () => {
    const existingCollection: Record<string, unknown> = { name: 'products' };
    existingCollection['num_documents'] = 5;

    const { helper } = makeHelper({
      existsByName: { products: true },
      collectionByName: { products: existingCollection },
    });
    const result = await helper.ensureCollection({ schema });
    expect(result.name).toBe('products');
  });

  test('ensureCollection creates then returns when absent', async () => {
    const { helper, fake } = makeHelper({
      existsByName: { products: false },
      collectionByName: { products: { name: 'products' } },
    });
    const result = await helper.ensureCollection({ schema });
    expect(fake.calls.some(c => c.op === 'collections.create')).toBe(true);
    expect(result.name).toBe('products');
  });

  test('collectionExists surfaces an infrastructure failure instead of reporting absence', async () => {
    const { helper } = makeHelper({ throwOn: { 'collections.exists': new Error('network') } });
    await expectRejection({
      task: helper.collectionExists({ name: 'products' }),
      message: /temporarily unavailable/i,
    });
  });

  test('patchCollectionSchema calls collections(name).update with fields', async () => {
    const { helper, fake } = makeHelper();
    await helper.patchCollectionSchema({
      name: 'products',
      fields: [{ name: 'sku', type: 'string', optional: true }],
    });
    const call = fake.calls.find(c => c.op === 'collections.update');
    expect(call).toBeTruthy();
    expect(call?.args[1]).toEqual({ fields: [{ name: 'sku', type: 'string', optional: true }] });
  });

  test('deleteCollection returns true on success, false on 404', async () => {
    const ok = makeHelper();
    expect(await ok.helper.deleteCollection({ name: 'products' })).toBe(true);
    const missing = makeHelper({ throwOn: { 'collections.delete': { httpStatus: 404 } } });
    expect(await missing.helper.deleteCollection({ name: 'nope' })).toBe(false);
  });

  test('upsertAlias calls aliases().upsert with collection_name', async () => {
    const { helper, fake } = makeHelper();
    await helper.upsertAlias({ name: 'products', collection: 'products_v2' });
    const call = fake.calls.find(c => c.op === 'aliases.upsert');
    const expectedMapping: Record<string, unknown> = {};
    expectedMapping['collection_name'] = 'products_v2';
    expect(call?.args).toEqual(['products', expectedMapping]);
  });

  test('getCollection throws a sanitized 404 (not 503) when the collection is missing', async () => {
    const { helper } = makeHelper({ throwOn: { 'collections.retrieve': { httpStatus: 404 } } });
    let caught: unknown;
    try {
      await helper.getCollection({ name: 'missing' });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ApplicationError);
    expect((caught as ApplicationError).statusCode).toBe(404);
    expect((caught as ApplicationError).normalized.code).toBe('core.search_engine.not_found');
  });

  test('patchCollectionSchema throws a sanitized 404 when the collection is missing', async () => {
    const { helper } = makeHelper({ throwOn: { 'collections.update': { httpStatus: 404 } } });
    let caught: unknown;
    try {
      await helper.patchCollectionSchema({ name: 'missing', fields: [] });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ApplicationError);
    expect((caught as ApplicationError).statusCode).toBe(404);
  });

  test('getAlias maps collection_name → IAliasInfo, null when missing', async () => {
    const aliasResponse: Record<string, string> = { name: 'products' };
    aliasResponse['collection_name'] = 'products_v2';

    const present = makeHelper({
      aliasByName: { products: aliasResponse },
    });
    expect(await present.helper.getAlias({ name: 'products' })).toEqual({
      name: 'products',
      collection: 'products_v2',
    });
    const absent = makeHelper({ throwOn: { 'aliases.retrieve': { httpStatus: 404 } } });
    expect(await absent.helper.getAlias({ name: 'nope' })).toBeNull();
  });
});
