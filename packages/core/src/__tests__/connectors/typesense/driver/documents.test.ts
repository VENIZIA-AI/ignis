import { describe, test, expect } from 'bun:test';
import { ApplicationError } from '@venizia/ignis-helpers';
import { TypesenseDirtyValues, TypesenseImportActions } from '@/connectors/typesense/types';
import { makeHelper } from './fake-client';

interface IProduct {
  id: string;
  title: string;
}

describe('TypesenseDriver documents', () => {
  test('createDocument forwards to documents().create', async () => {
    const { helper, fake } = makeHelper();
    const doc: IProduct = { id: '1', title: 'Shoe' };
    const result = await helper.createDocument<IProduct>({ collection: 'products', document: doc });
    expect(result).toEqual(doc);
    expect(fake.calls.some(c => c.op === 'documents.create')).toBe(true);
  });

  test('getDocument retrieves by id', async () => {
    const { helper } = makeHelper({ documentById: { '1': { id: '1', title: 'Shoe' } } });
    const result = await helper.getDocument<IProduct>({ collection: 'products', id: '1' });
    expect(result.title).toBe('Shoe');
  });

  test('upsertDocument forwards to documents().upsert', async () => {
    const { helper, fake } = makeHelper();
    await helper.upsertDocument<IProduct>({
      collection: 'products',
      document: { id: '1', title: 'X' },
    });
    expect(fake.calls.some(c => c.op === 'documents.upsert')).toBe(true);
  });

  test('deleteDocument returns true; false on 404', async () => {
    const ok = makeHelper();
    expect(await ok.helper.deleteDocument({ collection: 'products', id: '1' })).toBe(true);
    const missing = makeHelper({ throwOn: { 'documents.delete': { httpStatus: 404 } } });
    expect(await missing.helper.deleteDocument({ collection: 'products', id: '9' })).toBe(false);
  });

  test('importDocuments batches by batchSize and aggregates counts', async () => {
    const docs = Array.from({ length: 5 }, (_, i) => ({ id: String(i), title: `t${i}` }));
    const { helper, fake } = makeHelper({
      importResponse: [{ success: true }, { success: false }],
    });
    const result = await helper.importDocuments({
      collection: 'products',
      documents: docs,
      action: TypesenseImportActions.UPSERT,
      batchSize: 2,
    });
    // 5 docs / batch 2 => 3 import calls.
    expect(fake.calls.filter(c => c.op === 'documents.import').length).toBe(3);
    // Each call returns 1 success + 1 fail => 3 success, 3 fail.
    expect(result.successCount).toBe(3);
    expect(result.failCount).toBe(3);
  });

  test('importDocuments rejects an invalid action', async () => {
    const { helper } = makeHelper();
    let caught: unknown;
    try {
      await helper.importDocuments({
        collection: 'products',
        documents: [{ id: '1' }],
        // @ts-expect-error 'bogus' is not a valid TTypesenseImportAction - probes the runtime guard for untyped callers
        action: 'bogus',
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ApplicationError);
    expect((caught as ApplicationError).message).toContain('Invalid action');
  });

  test('deleteByFilter returns num_deleted', async () => {
    const { helper, fake } = makeHelper({ numDeleted: 7 });
    expect(
      await helper.deleteByFilter({ collection: 'products', filterBy: 'status:=archived' }),
    ).toBe(7);
    const delCall = fake.calls.find(c => c.op === 'documents.delete');
    // eslint-disable-next-line @typescript-eslint/naming-convention
    expect(delCall?.args[2]).toEqual({ filter_by: 'status:=archived' });
  });

  test('updateByFilter returns updatedCount', async () => {
    const { helper, fake } = makeHelper({ numUpdated: 4 });
    const result = await helper.updateByFilter({
      collection: 'products',
      document: { title: 'X' },
      filterBy: 'status:=draft',
    });
    expect(result.updatedCount).toBe(4);
    const updCall = fake.calls.find(c => c.op === 'documents.update');
    // eslint-disable-next-line @typescript-eslint/naming-convention
    expect(updCall?.args[3]).toEqual({ filter_by: 'status:=draft' });
  });

  test('exportDocuments returns JSONL string', async () => {
    const { helper } = makeHelper({ exportResult: '{"id":"1"}\n{"id":"2"}' });
    expect(await helper.exportDocuments({ collection: 'products' })).toContain('"id":"1"');
  });

  test('importDocuments treats batchSize <= 0 as the default (no hang)', async () => {
    const docs = Array.from({ length: 3 }, (_, i) => ({ id: String(i) }));
    const { helper, fake } = makeHelper();
    await helper.importDocuments({
      collection: 'products',
      documents: docs,
      action: TypesenseImportActions.UPSERT,
      batchSize: 0,
    });
    // batchSize 0 must NOT loop forever; falls back to default 100 => exactly 1 import call.
    expect(fake.calls.filter(c => c.op === 'documents.import').length).toBe(1);
  });

  test('importDocuments forwards dirty_values and throwOnFail:false', async () => {
    const { helper, fake } = makeHelper();
    await helper.importDocuments({
      collection: 'products',
      documents: [{ id: '1' }],
      action: TypesenseImportActions.CREATE,
      dirtyValues: TypesenseDirtyValues.COERCE_OR_DROP,
    });
    const call = fake.calls.find(c => c.op === 'documents.import');
    // call.args = [collection, documents, importParams]

    /* eslint-disable @typescript-eslint/naming-convention */
    expect(call?.args[2]).toMatchObject({
      action: 'create',
      dirty_values: 'coerce_or_drop',
      throwOnFail: false,
    });
    /* eslint-enable @typescript-eslint/naming-convention */
  });

  test('importDocuments rejects an invalid dirtyValues', async () => {
    const { helper } = makeHelper();
    let caught: unknown;
    try {
      await helper.importDocuments({
        collection: 'products',
        documents: [{ id: '1' }],
        action: TypesenseImportActions.UPSERT,
        // @ts-expect-error 'bogus' is not a valid TTypesenseDirtyValue - probes the runtime guard for untyped callers
        dirtyValues: 'bogus',
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ApplicationError);
    expect((caught as ApplicationError).message).toContain('Invalid dirtyValues');
  });

  test('updateDocument PATCHes by id', async () => {
    const { helper, fake } = makeHelper();
    await helper.updateDocument<{ id: string; title: string }>({
      collection: 'products',
      id: '1',
      document: { title: 'New' },
    });
    const call = fake.calls.find(c => c.op === 'documents.update');
    expect(call?.args[1]).toBe('1'); // the bound document id
  });

  test('deleteAllDocuments uses the native truncate primitive', async () => {
    const { helper, fake } = makeHelper({ numDeleted: 12 });
    const isOk = await helper.deleteAllDocuments({ collection: 'products' });
    expect(isOk).toBe(true);
    // Full-collection delete: id is undefined, args[2] holds the truncate params.
    const call = fake.calls.find(c => c.op === 'documents.delete');
    expect(call?.args[2]).toEqual({ truncate: true });
  });

  test('getDocument throws a sanitized 404 (not 503) when the document is missing', async () => {
    const { helper } = makeHelper({ throwOn: { 'documents.retrieve': { httpStatus: 404 } } });
    let caught: unknown;
    try {
      await helper.getDocument({ collection: 'products', id: 'missing' });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ApplicationError);
    expect((caught as ApplicationError).statusCode).toBe(404);
    expect((caught as ApplicationError).messageCode).toBe('core.search_engine.not_found');
  });

  test('updateDocument throws a sanitized 404 (not 503) when the document is missing', async () => {
    const { helper } = makeHelper({ throwOn: { 'documents.update': { httpStatus: 404 } } });
    let caught: unknown;
    try {
      await helper.updateDocument({ collection: 'products', id: 'missing', document: { t: 1 } });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ApplicationError);
    expect((caught as ApplicationError).statusCode).toBe(404);
  });

  test('importDocuments attaches partial progress to the error when a later batch fails', async () => {
    const docs = Array.from({ length: 3 }, (_, i) => ({ id: String(i) }));
    const { helper } = makeHelper({ importBatchErrors: { 1: new Error('network blip') } });
    let caught: unknown;
    try {
      await helper.importDocuments({
        collection: 'products',
        documents: docs,
        action: TypesenseImportActions.UPSERT,
        batchSize: 1,
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ApplicationError);
    const appError = caught as ApplicationError;
    expect(appError.statusCode).toBe(503);
    // Batch 0 (1 doc) succeeded server-side before batch 1 blew up — progress must be surfaced.
    expect(appError.extra?.details).toEqual({
      totalCount: 3,
      processedCount: 1,
      successCount: 1,
      failCount: 0,
    });
    // No internal leakage on the sanitized message:
    expect(appError.message).not.toContain('network blip');
  });

  test('importDocuments defaults action to create', async () => {
    const { helper, fake } = makeHelper();
    await helper.importDocuments({ collection: 'products', documents: [{ id: '1' }] });
    const call = fake.calls.find(c => c.op === 'documents.import');
    expect(call?.args[2]).toMatchObject({ action: 'create' });
  });

  test('deleteByFilter forwards batch_size and ignore_not_found', async () => {
    const { helper, fake } = makeHelper({ numDeleted: 2 });
    await helper.deleteByFilter({
      collection: 'products',
      filterBy: 'status:=archived',
      batchSize: 500,
      ignoreNotFound: true,
    });
    const call = fake.calls.find(c => c.op === 'documents.delete');

    /* eslint-disable @typescript-eslint/naming-convention */
    expect(call?.args[2]).toEqual({
      filter_by: 'status:=archived',
      batch_size: 500,
      ignore_not_found: true,
    });
    /* eslint-enable @typescript-eslint/naming-convention */
  });
});
