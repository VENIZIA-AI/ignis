import { describe, test, expect } from 'bun:test';
import { SearchEngineInternal } from '@/modules/search-engine/internal';
import { TypesenseInternal } from '@/modules/search-engine/typesense/internal/typesense-internal.helper';
import { Logger, LoggerFactory } from '@/modules/logger';
import { ApplicationError } from '@/modules/error';

const logger = LoggerFactory.getLogger(['SearchEngineInternalTest']);

describe('TypesenseInternal.isAlreadyExistsError', () => {
  test('detects httpStatus 409', () => {
    expect(TypesenseInternal.isAlreadyExistsError({ error: { httpStatus: 409 } })).toBe(true);
  });
  test('detects "already exists" message when no httpStatus is present', () => {
    expect(
      TypesenseInternal.isAlreadyExistsError({
        error: new Error('A collection with name `x` already exists.'),
      }),
    ).toBe(true);
  });
  test('is strict when an httpStatus IS present: a 5xx echoing the phrase is NOT a 409', () => {
    expect(
      TypesenseInternal.isAlreadyExistsError({
        error: { httpStatus: 503, message: 'Server said: already exists' },
      }),
    ).toBe(false);
  });
  test('returns false otherwise', () => {
    expect(TypesenseInternal.isAlreadyExistsError({ error: new Error('boom') })).toBe(false);
    expect(TypesenseInternal.isAlreadyExistsError({ error: undefined })).toBe(false);
  });
});

describe('TypesenseInternal.isNotFoundError', () => {
  test('detects httpStatus 404', () => {
    expect(TypesenseInternal.isNotFoundError({ error: { httpStatus: 404 } })).toBe(true);
  });
  test('detects "not found" message when no httpStatus is present', () => {
    expect(TypesenseInternal.isNotFoundError({ error: new Error('Not Found') })).toBe(true);
  });
  test('is strict when an httpStatus IS present: an outage 5xx echoing "not found" is NOT a 404', () => {
    expect(
      TypesenseInternal.isNotFoundError({
        error: {
          httpStatus: 503,
          message: 'Request failed with HTTP code 503 | Server said: alias not found',
        },
      }),
    ).toBe(false);
  });
  test('returns false otherwise', () => {
    expect(TypesenseInternal.isNotFoundError({ error: new Error('boom') })).toBe(false);
    expect(TypesenseInternal.isNotFoundError({ error: undefined })).toBe(false);
  });
});

describe('SearchEngineInternal.wrapDependencyError', () => {
  test('throws a sanitized 503 ApplicationError without raw detail', () => {
    const raw = new Error('connection refused at typesense-internal-host:8108 secret-api-key');
    let thrown: unknown;
    try {
      SearchEngineInternal.wrapDependencyError({ method: 'search', error: raw, logger });
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(ApplicationError);
    const appError = thrown as ApplicationError;
    expect(appError.statusCode).toBe(503);
    expect(appError.message).toContain('[search]');
    // No internal leakage:
    expect(appError.message).not.toContain('secret-api-key');
    expect(appError.message).not.toContain('typesense-internal-host');
  });

  test('logs the full internal detail (observability retained) while throwing sanitized', () => {
    const captured: string[] = [];
    const mockLogger = {
      for: (_method: string) => ({
        error: (_msg: string, ...args: unknown[]) => {
          captured.push(String(args[0]));
        },
      }),
    } as unknown as Logger;
    const raw = new Error('connection refused at typesense-internal-host:8108 secret-api-key');

    let thrown: unknown;
    try {
      SearchEngineInternal.wrapDependencyError({
        method: 'search',
        error: raw,
        logger: mockLogger,
      });
    } catch (e) {
      thrown = e;
    }

    expect(captured.length).toBe(1);
    expect(captured[0]).toContain('connection refused');
    expect(captured[0]).toContain('secret-api-key');
    expect((thrown as ApplicationError).message).not.toContain('secret-api-key');
  });

  test('attaches caller-actionable details to the thrown error extra payload', () => {
    let thrown: unknown;
    try {
      SearchEngineInternal.wrapDependencyError({
        method: 'importDocuments',
        error: new Error('blip'),
        logger,
        details: { totalCount: 10, processedCount: 4, successCount: 4, failCount: 0 },
      });
    } catch (e) {
      thrown = e;
    }
    expect((thrown as ApplicationError).extra?.details).toEqual({
      totalCount: 10,
      processedCount: 4,
      successCount: 4,
      failCount: 0,
    });
  });
});

describe('SearchEngineInternal.throwNotFoundError', () => {
  test('throws a sanitized 404 with the not_found messageCode', () => {
    let thrown: unknown;
    try {
      SearchEngineInternal.throwNotFoundError({
        method: 'getDocument',
        subject: "Document 'd1' in collection 'products'",
      });
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(ApplicationError);
    const appError = thrown as ApplicationError;
    expect(appError.statusCode).toBe(404);
    expect(appError.messageCode).toBe('helpers.search_engine.not_found');
    expect(appError.message).toContain('[getDocument]');
    expect(appError.message).toContain("Document 'd1'");
  });
});
