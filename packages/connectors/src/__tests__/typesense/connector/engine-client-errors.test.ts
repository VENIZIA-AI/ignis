import { describe, expect, test } from 'bun:test';
import { TypesenseImportActions } from '@/search/typesense/common';
import { makeHelper } from './fake-client';

/** The `ApplicationError` a call rejected with; the test fails if it resolved. */
const rejection = async (opts: { promise: Promise<unknown> }) => {
  try {
    await opts.promise;
  } catch (error) {
    return error as {
      statusCode: number;
      message: string;
      cause?: unknown;
      normalized?: { code?: string };
      extra?: Record<string, unknown>;
    };
  }

  throw new Error('expected the call to reject');
};

const update = (opts: { throwOn: unknown }) => {
  const { helper } = makeHelper({ throwOn: { 'documents.update': opts.throwOn } });
  return rejection({
    promise: helper.updateDocument({ collection: 'products', id: '1', document: {} }),
  });
};

describe("TypesenseConnector: an engine 4xx is the caller's mistake, not an outage", () => {
  test('an empty patch the engine answers with 400 is a 400 that keeps the engine message', async () => {
    const error = await update({
      throwOn: {
        httpStatus: 400,
        message: 'Request failed with HTTP code 400 | Server said: Bad JSON.',
      },
    });

    expect(error.statusCode).toBe(400);
    expect(error.message).toContain('Server said: Bad JSON.');
    expect(error.normalized?.code).not.toBe('core.search_engine.dependency_unavailable');
    expect((error.cause as { httpStatus?: number }).httpStatus).toBe(400);
  });

  test('a 422 is a 422', async () => {
    const error = await update({
      throwOn: { httpStatus: 422, message: 'Field `price` must be an int32.' },
    });

    expect(error.statusCode).toBe(422);
    expect(error.message).toContain('Field `price` must be an int32.');
  });

  test('a 409 is the already_exists conflict', async () => {
    const error = await update({
      throwOn: { httpStatus: 409, message: 'A document with id 1 already exists.' },
    });

    expect(error.statusCode).toBe(409);
    expect(error.normalized?.code).toBe('core.search_engine.already_exists');
    expect(error.message).toContain('already exists');
  });

  test('a 404 on a verb that does not tolerate it is the not_found error', async () => {
    const { helper } = makeHelper({
      throwOn: {
        'documents.create': { httpStatus: 404, message: 'Not Found: collection products' },
      },
    });

    const error = await rejection({
      promise: helper.createDocument({ collection: 'products', document: { id: '1' } }),
    });

    expect(error.statusCode).toBe(404);
    expect(error.normalized?.code).toBe('core.search_engine.not_found');
    expect(error.message).toContain('collection products');
  });

  for (const httpStatus of [500, 502, 503, 401, 403, 408, 429]) {
    test(`a ${httpStatus} stays the sanitized 503 dependency error, without the engine message`, async () => {
      const error = await update({ throwOn: { httpStatus, message: 'internal engine detail' } });

      expect(error.statusCode).toBe(503);
      expect(error.normalized?.code).toBe('core.search_engine.dependency_unavailable');
      expect(error.message).not.toContain('internal engine detail');
    });
  }

  test('a transport failure with no status stays the 503', async () => {
    const error = await update({ throwOn: new Error('connect ECONNREFUSED 127.0.0.1:8108') });

    expect(error.statusCode).toBe(503);
    expect(error.message).not.toContain('ECONNREFUSED');
  });

  test('an import batch the engine rejects with 400 is a 400 that carries the progress made', async () => {
    const docs = Array.from({ length: 4 }, (_, index) => ({ id: String(index) }));
    const { helper } = makeHelper({
      importResponse: [{ success: true }],
      importBatchErrors: { 1: { httpStatus: 400, message: 'Bad document in batch' } },
    });

    const error = await rejection({
      promise: helper.importDocuments({
        collection: 'products',
        documents: docs,
        action: TypesenseImportActions.CREATE,
        batchSize: 2,
      }),
    });

    expect(error.statusCode).toBe(400);
    expect(error.message).toContain('Bad document in batch');
    expect(error.extra?.['details']).toMatchObject({ totalCount: 4, processedCount: 1 });
  });
});
