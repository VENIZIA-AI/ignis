import { SearchErrorCodes } from '@/common';
import type { Logger } from '@venizia/ignis-helpers';
import { getError, HTTP } from '@venizia/ignis-helpers';

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
        'Search engine dependency error | detail: %s',
        SearchConnectorInternal.describeError({ error }),
      );

    const wrapped = getError({
      statusCode: HTTP.ResultCodes.RS_5.ServiceUnavailable,
      messageCode: SearchErrorCodes.DEPENDENCY_UNAVAILABLE,
      message: `[${method}] Search engine is temporarily unavailable.`,
      ...(details ? { details } : {}),
    });

    // The original engine error carries the code the CALLER may need to classify on - Meilisearch
    // reports `index_already_exists` as a failed TASK, and a connector that tolerates it (an
    // idempotent createCollection on the second boot) can only see it through here.
    //
    // Assigned AFTER construction on purpose: passing `cause` to getError() would land it in
    // `extra`, which the error middleware puts on the WIRE. As a plain `cause` it reaches the
    // response only in a development environment, where stack and cause are already exposed.
    (wrapped as { cause?: unknown }).cause = error;
    throw wrapped;
  }

  // Throws a sanitized 404; `subject` must only contain caller-provided identifiers, never engine internals.
  static throwNotFoundError(opts: { method: string; subject: string }): never {
    const { method, subject } = opts;

    throw getError({
      statusCode: HTTP.ResultCodes.RS_4.NotFound,
      messageCode: SearchErrorCodes.NOT_FOUND,
      message: `[${method}] ${subject} not found.`,
    });
  }
}
