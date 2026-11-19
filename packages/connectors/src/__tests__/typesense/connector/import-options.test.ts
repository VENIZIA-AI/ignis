import { afterAll, describe, expect, test } from 'bun:test';
import { RejectionHelper } from '@venizia/dev-configs/testing';
import { TypesenseConnector } from '@/search/typesense/connector';
import { TypesenseImportActions } from '@/search/typesense/common';
import { makeHelper } from './fake-client';

const importParamsOf = (fake: { calls: Array<{ op: string; args: unknown[] }> }) =>
  fake.calls.find((call) => call.op === 'documents.import')?.args[2];

describe('importDocuments: remote embedding, returnId and returnDoc', () => {
  test('camelCase options reach the client as the snake_case parameters Typesense documents', async () => {
    const { helper, fake } = makeHelper();

    await helper.importDocuments({
      collection: 'products',
      documents: [{ id: '1' }],
      remoteEmbedding: { batchSize: 10, timeoutMs: 20_000, numTries: 3 },
      returnId: true,
      returnDoc: false,
    });

    expect(importParamsOf(fake)).toEqual({
      ['remote_embedding_batch_size']: 10,
      ['remote_embedding_timeout_ms']: 20_000,
      ['remote_embedding_num_tries']: 3,
      ['return_id']: true,
      ['return_doc']: false,
      action: 'create',
      throwOnFail: false,
    });
  });

  test('a field left out is not sent: the engine keeps its own default', async () => {
    const { helper, fake } = makeHelper();

    await helper.importDocuments({
      collection: 'products',
      documents: [{ id: '1' }],
      remoteEmbedding: { batchSize: 5 },
    });

    expect(importParamsOf(fake)).toEqual({
      ['remote_embedding_batch_size']: 5,
      action: 'create',
      throwOnFail: false,
    });
  });

  test('without any of them the parameters are what they always were', async () => {
    const { helper, fake } = makeHelper();

    await helper.importDocuments({ collection: 'products', documents: [{ id: '1' }] });

    expect(importParamsOf(fake)).toEqual({ action: 'create', throwOnFail: false });
  });

  test('the connector-owned fields stay single-source, and go to every batch', async () => {
    const { helper, fake } = makeHelper();

    await helper.importDocuments({
      collection: 'products',
      documents: [{ id: '1' }, { id: '2' }, { id: '3' }],
      action: TypesenseImportActions.UPSERT,
      batchSize: 2,
      remoteEmbedding: { numTries: 2 },
    });

    const calls = fake.calls.filter((call) => call.op === 'documents.import');

    expect(calls).toHaveLength(2);

    for (const call of calls) {
      expect(call.args[2]).toEqual({
        ['remote_embedding_num_tries']: 2,
        action: 'upsert',
        throwOnFail: false,
      });
    }
  });

  test.each([
    ['remoteEmbedding.batchSize', { remoteEmbedding: { batchSize: 0 } }],
    ['remoteEmbedding.batchSize', { remoteEmbedding: { batchSize: -1 } }],
    ['remoteEmbedding.timeoutMs', { remoteEmbedding: { timeoutMs: 1.5 } }],
    ['remoteEmbedding.numTries', { remoteEmbedding: { numTries: Number.NaN } }],
    ['remoteEmbedding.numTries', { remoteEmbedding: { numTries: Number.POSITIVE_INFINITY } }],
  ])(
    '%s that is not a positive integer is refused before anything is sent',
    async (name, options) => {
      const { helper, fake } = makeHelper();
      const error = await RejectionHelper.rejectionOf({
        task: helper.importDocuments({
          collection: 'products',
          documents: [{ id: '1' }],
          ...options,
        }),
      });

      expect((error as Error).message).toContain(`Invalid ${name}`);
      expect(fake.calls.filter((call) => call.op === 'documents.import')).toHaveLength(0);
    },
  );

  test('a flag that is not a boolean is refused (an untyped caller)', async () => {
    const { helper } = makeHelper();
    const untyped: Record<string, unknown> = { returnId: 'yes' };
    const error = await RejectionHelper.rejectionOf({
      task: helper.importDocuments({
        collection: 'products',
        documents: [{ id: '1' }],
        ...untyped,
      }),
    });

    expect((error as Error).message).toContain('Invalid returnId');
  });
});

describe('what Typesense receives, and the extra fields of each row', () => {
  const seen: Array<{ method: string; path: string; query: URLSearchParams; body: string }> = [];
  const server = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch: async (request) => {
      const url = new URL(request.url);

      const result2 = await request.text();
      seen.push({
        method: request.method,
        path: url.pathname,
        query: url.searchParams,
        body: result2,
      });

      // Typesense answers an import as JSON lines, one per document; return_id and return_doc add fields to each.
      return new Response(
        [
          JSON.stringify({ success: true, id: '1', document: { id: '1', title: 'Shoe' } }),
          JSON.stringify({ success: false, error: 'bad', code: 400, id: '2' }),
        ].join('\n'),
        { headers: { 'content-type': 'text/plain' } },
      );
    },
  });

  afterAll(async () => {
    await server.stop(true);
  });

  const connector = () =>
    new TypesenseConnector({
      name: 'wire',
      nodes: [{ host: '127.0.0.1', port: server.port as number, protocol: 'http' }],
      apiKey: 'k',
    });

  test('the import request carries the snake_case query parameters, once, with the connector-owned ones', async () => {
    seen.length = 0;

    await connector().importDocuments({
      collection: 'products',
      documents: [{ id: '1' }, { id: '2' }],
      dirtyValues: 'coerce_or_drop',
      remoteEmbedding: { batchSize: 8, timeoutMs: 30_000, numTries: 4 },
      returnId: true,
      returnDoc: true,
    });

    expect(seen).toHaveLength(1);
    expect(seen[0].method).toBe('POST');
    expect(seen[0].path).toBe('/collections/products/documents/import');
    expect(Object.fromEntries(seen[0].query)).toEqual({
      action: 'create',
      ['dirty_values']: 'coerce_or_drop',
      ['remote_embedding_batch_size']: '8',
      ['remote_embedding_timeout_ms']: '30000',
      ['remote_embedding_num_tries']: '4',
      ['return_id']: 'true',
      ['return_doc']: 'true',
      // The client writes its own `throwOnFail` into the query as well, as it always did.
      throwOnFail: 'false',
    });
    expect(seen[0].body.split('\n')).toHaveLength(2);
  });

  test('each response row keeps the id and the document Typesense returned, and the counts still tally', async () => {
    const result = await connector().importDocuments({
      collection: 'products',
      documents: [{ id: '1' }, { id: '2' }],
      returnId: true,
      returnDoc: true,
    });

    expect(result.count).toEqual({ success: 1, fail: 1 });
    expect(result.responses[0]).toEqual({
      success: true,
      id: '1',
      document: { id: '1', title: 'Shoe' },
    });
    expect(result.responses[1]).toMatchObject({ success: false, id: '2', code: 400 });
  });

  test('with none of the options the query is what it always was', async () => {
    seen.length = 0;

    await connector().importDocuments({ collection: 'products', documents: [{ id: '1' }] });

    expect(Object.fromEntries(seen[0].query)).toEqual({ action: 'create', throwOnFail: 'false' });
  });
});
