import { describe, expect, test } from 'bun:test';
import { MeilisearchApiError } from 'meilisearch';
import { MeilisearchConnector } from '@/search/meilisearch/connector';
import { FakeMeilisearchClient } from './fake-client';
import { captureRejection } from './test-helpers';

/** A client whose `getIndex` answers with the real SDK error for `status`, as a live engine does. */
class FailingGetIndexClient extends FakeMeilisearchClient {
  constructor(private readonly failure: unknown) {
    super();
  }

  override async getIndex(): Promise<unknown> {
    throw this.failure;
  }
}

const engineError = (opts: { status: number; code: string; message: string }) =>
  new MeilisearchApiError(new Response(null, { status: opts.status }), {
    message: opts.message,
    code: opts.code,
    type: 'invalid_request',
    link: '',
  });

const createDocumentFailing = (opts: { failure: unknown }) => {
  const connector = new MeilisearchConnector({
    name: 'meili-4xx',
    host: 'http://localhost:7700',
    taskIntervalMs: 1,
    client: new FailingGetIndexClient(opts.failure),
  });

  return captureRejection(() =>
    connector.document.create({ collection: 'articles', document: { id: '1' } }),
  ) as Promise<{ statusCode?: number; message: string; normalized?: { code?: string } }>;
};

describe("MeilisearchConnector: an engine 4xx is the caller's mistake, not an outage", () => {
  test('a 400 is a 400 that keeps the engine message', async () => {
    const error = await createDocumentFailing({
      failure: engineError({
        status: 400,
        code: 'invalid_document_id',
        message: 'Document identifier `a b` is invalid.',
      }),
    });

    expect(error.statusCode).toBe(400);
    expect(error.message).toContain('Document identifier `a b` is invalid.');
  });

  test('a 422 is a 422', async () => {
    const error = await createDocumentFailing({
      failure: engineError({
        status: 422,
        code: 'invalid_request',
        message: 'The body cannot be processed.',
      }),
    });

    expect(error.statusCode).toBe(422);
  });

  test('a 409 is the already_exists conflict', async () => {
    const error = await createDocumentFailing({
      failure: engineError({ status: 409, code: 'conflict', message: 'Conflict.' }),
    });

    expect(error.statusCode).toBe(409);
    expect(error.normalized?.code).toBe('core.search_engine.already_exists');
  });

  for (const status of [500, 503, 401, 403, 429]) {
    test(`a ${status} stays the sanitized 503, without the engine message`, async () => {
      const error = await createDocumentFailing({
        failure: engineError({ status, code: 'internal', message: 'internal engine detail' }),
      });

      expect(error.statusCode).toBe(503);
      expect(error.normalized?.code).toBe('core.search_engine.dependency_unavailable');
      expect(error.message).not.toContain('internal engine detail');
    });
  }

  test('a transport failure with no status stays the 503', async () => {
    const error = await createDocumentFailing({ failure: new Error('connect ECONNREFUSED') });

    expect(error.statusCode).toBe(503);
  });
});
