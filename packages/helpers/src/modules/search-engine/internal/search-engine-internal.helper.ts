import { HTTP } from '@/common/constants';
import { getError } from '@/modules/error';
import { Logger } from '@/modules/logger';

// Engine-agnostic error plumbing shared by every search-engine backend (typesense today,
// meilisearch/opensearch later). Backend-specific classification (what counts as 404/409 for a
// given engine) stays in each backend's own internal helper.
export class SearchEngineInternal {
  // Extracts loggable detail from an error (Error message/stack are non-enumerable, so `%j` on a
  // raw Error yields `{}` — extract them so internal logs retain full detail).
  static describeError(opts: { error: unknown }): unknown {
    const { error } = opts;
    return error instanceof Error ? (error.stack ?? error.message) : error;
  }

  // Logs the full error internally; throws a sanitized 503 with zero internal leakage.
  // `details` (optional) is attached to the thrown error's extra payload — use it for
  // caller-actionable progress info (counts, offsets), never for internal/engine detail.
  static wrapDependencyError(opts: {
    method: string;
    error: unknown;
    logger: Logger;
    details?: Record<string, unknown>;
  }): never {
    const { method, error, logger, details } = opts;

    logger
      .for(method)
      .error(
        'Search engine dependency error | detail: %j',
        SearchEngineInternal.describeError({ error }),
      );

    throw getError({
      statusCode: HTTP.ResultCodes.RS_5.ServiceUnavailable,
      messageCode: 'helpers.search_engine.dependency_unavailable',
      message: `[${method}] Search engine is temporarily unavailable.`,
      ...(details ? { details } : {}),
    });
  }

  // Throws a sanitized 404 for a genuinely missing resource. `subject` must only contain
  // caller-provided identifiers (collection name, document id) — never engine internals.
  static throwNotFoundError(opts: { method: string; subject: string }): never {
    const { method, subject } = opts;

    throw getError({
      statusCode: HTTP.ResultCodes.RS_4.NotFound,
      messageCode: 'helpers.search_engine.not_found',
      message: `[${method}] ${subject} not found.`,
    });
  }
}
