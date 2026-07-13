import { describe, expect, test } from 'bun:test';
import { MeilisearchApiError } from 'meilisearch';
import { MeilisearchInternal } from '@/connectors/meilisearch/internal';

/**
 * Classification is built against the SDK's REAL error shape, never a fake's.
 *
 * `MeilisearchApiError` carries `cause: { message, code, type, link }` and `response: Response` - it
 * has NO top-level `code` and NO `httpStatus`. A classifier reading those two fields answers `false`
 * to every question against a live engine, which turns a 404 into a 503: `create()` would report the
 * engine as down for every brand-new document, because its existence probe 404s by design.
 *
 * A task failure arrives in the OTHER shape - the flat `MeilisearchErrorResponse` off `task.error` -
 * so both must be understood.
 */
const buildApiError = (opts: { status: number; code: string }): MeilisearchApiError => {
  const { status, code } = opts;

  return new MeilisearchApiError(new Response(null, { status }), {
    message: `boom: ${code}`,
    code,
    type: 'invalid_request',
    link: 'https://www.meilisearch.com/docs/reference/errors/error_codes',
  });
};

/** What `task.error` looks like: the flat error body, not an Error instance. */
const buildTaskError = (code: string) => {
  return { message: `boom: ${code}`, code, type: 'invalid_request', link: '' };
};

describe('MeilisearchInternal - the SDK error shape (MeilisearchApiError)', () => {
  test('a document_not_found API error IS a not-found', () => {
    const error = buildApiError({ status: 404, code: MeilisearchInternal.DOCUMENT_NOT_FOUND });

    expect(MeilisearchInternal.getErrorCode({ error })).toBe('document_not_found');
    expect(MeilisearchInternal.isNotFoundError({ error })).toBe(true);
  });

  test('an index_not_found API error IS a not-found', () => {
    const error = buildApiError({ status: 404, code: MeilisearchInternal.INDEX_NOT_FOUND });

    expect(MeilisearchInternal.isNotFoundError({ error })).toBe(true);
  });

  test('any 404 is a not-found even when the code is one we do not name', () => {
    const error = buildApiError({ status: 404, code: 'some_new_code' });

    expect(MeilisearchInternal.isNotFoundError({ error })).toBe(true);
  });

  test('an index_already_exists API error IS an already-exists', () => {
    const error = buildApiError({ status: 409, code: MeilisearchInternal.INDEX_ALREADY_EXISTS });

    expect(MeilisearchInternal.isAlreadyExistsError({ error })).toBe(true);
  });

  test('a 500 from the engine is NEITHER - it must stay a dependency failure', () => {
    const error = buildApiError({ status: 500, code: 'internal' });

    expect(MeilisearchInternal.isNotFoundError({ error })).toBe(false);
    expect(MeilisearchInternal.isAlreadyExistsError({ error })).toBe(false);
  });
});

describe('MeilisearchInternal - the task-failure shape (flat MeilisearchErrorResponse)', () => {
  test('a failed task carrying index_already_exists is recognized', () => {
    const error = buildTaskError(MeilisearchInternal.INDEX_ALREADY_EXISTS);

    expect(MeilisearchInternal.getErrorCode({ error })).toBe('index_already_exists');
    expect(MeilisearchInternal.isAlreadyExistsError({ error })).toBe(true);
  });

  test('a failed task carrying index_not_found is recognized', () => {
    const error = buildTaskError(MeilisearchInternal.INDEX_NOT_FOUND);

    expect(MeilisearchInternal.isNotFoundError({ error })).toBe(true);
  });
});

describe('MeilisearchInternal - non-errors', () => {
  test('null, undefined and a bare string classify as neither', () => {
    for (const error of [null, undefined, 'boom', 42]) {
      expect(MeilisearchInternal.isNotFoundError({ error })).toBe(false);
      expect(MeilisearchInternal.isAlreadyExistsError({ error })).toBe(false);
    }
  });
});
