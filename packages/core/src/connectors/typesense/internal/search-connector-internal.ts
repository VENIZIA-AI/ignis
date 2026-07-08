import { getError, HTTP, Logger } from '@venizia/ignis-helpers';

/** Engine-agnostic error plumbing shared by every search connector; backend-specific classification (what counts as 404/409) lives in each backend's own internal helper. */
export class SearchConnectorInternal {
  // Error/stack are non-enumerable, so `%j` on a raw Error yields `{}` — extract them so logs retain detail.
  static describeError(opts: { error: unknown }): unknown {
    const { error } = opts;
    return error instanceof Error ? (error.stack ?? error.message) : error;
  }

  // Logs the full error internally; throws a sanitized 503 with zero internal leakage.
  // `details` is for caller-actionable progress info (counts, offsets) only, never engine detail.
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
        SearchConnectorInternal.describeError({ error }),
      );

    throw getError({
      statusCode: HTTP.ResultCodes.RS_5.ServiceUnavailable,
      messageCode: 'core.search_engine.dependency_unavailable',
      message: `[${method}] Search engine is temporarily unavailable.`,
      ...(details ? { details } : {}),
    });
  }

  // Throws a sanitized 404; `subject` must only contain caller-provided identifiers, never engine internals.
  static throwNotFoundError(opts: { method: string; subject: string }): never {
    const { method, subject } = opts;

    throw getError({
      statusCode: HTTP.ResultCodes.RS_4.NotFound,
      messageCode: 'core.search_engine.not_found',
      message: `[${method}] ${subject} not found.`,
    });
  }
}
