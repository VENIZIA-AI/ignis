import { SearchErrorCodes } from '@/common';
import { SearchErrors } from '@/connectors/search/common';
import type { ILogger } from '@venizia/ignis-helpers/core';
import { getError } from '@venizia/ignis-helpers/core';
import { HTTP } from '@venizia/ignis-helpers/common';

/** Engine-agnostic error plumbing shared by every search connector; backend-specific classification (what counts as 404/409) lives in each backend's own internal helper. */
export class SearchConnectorInternal {
  // Error/stack are non-enumerable, so `%j` on a raw Error yields `{}` - extract them so logs retain detail.
  static describeError(opts: { error: unknown }): unknown {
    const { error } = opts;
    return error instanceof Error ? (error.stack ?? error.message) : error;
  }

  // Logs the full error internally, throws a sanitized 503 with zero internal leakage; `details` is caller-actionable progress info (counts, offsets) only, never engine detail.
  static wrapDependencyError(opts: {
    method: string;
    error: unknown;
    logger: ILogger;
    details?: Record<string, unknown>;
  }): never {
    const { method, error, logger, details } = opts;

    logger
      .for(method)
      .error(
        'Search engine dependency error | detail: %s',
        SearchConnectorInternal.describeError({ error }),
      );

    const wrapped = getError({
      statusCode: HTTP.ResultCodes.RS_5.ServiceUnavailable,
      messageCode: SearchErrorCodes.DEPENDENCY_UNAVAILABLE,
      message: `[${method}] Search engine is temporarily unavailable.`,
      ...(details ? { extra: { details } } : {}),
    });

    // Keeps the engine's own code for callers to classify on (tolerating `index_already_exists`); assigned AFTER construction because `cause` via getError() lands in `extra`, which goes on the WIRE, while a plain `cause` is exposed only in development.
    (wrapped as { cause?: unknown }).cause = error;
    throw wrapped;
  }

  // Throws a sanitized 404; `subject` must only contain caller-provided identifiers, never engine internals.
  static throwNotFoundError(opts: { method: string; subject: string }): never {
    const { method, subject } = opts;

    throw getError({
      error: SearchErrors.NOT_FOUND,
      message: `[${method}] ${subject} not found.`,
    });
  }
}
