import { RecordUtility } from '@/common/internal';
import { SearchErrorCodes } from '@venizia/ignis-kernel/repository';
import { SearchErrors } from '@/search/core/common';
import type { ILogger } from '@venizia/ignis-helpers/core';
import type { ApplicationError } from '@venizia/ignis-helpers/core';
import { getError } from '@venizia/ignis-helpers/core';
import { HTTP } from '@venizia/ignis-helpers/common';

/** Engine-agnostic error plumbing shared by every search connector; backend-specific classification (what counts as 404/409) lives in each backend's own internal helper. */
export class SearchConnectorInternal {
  // Error/stack are non-enumerable, so `%j` on a raw Error yields `{}` - extract them so logs retain detail.
  static describeError(opts: { error: unknown }): unknown {
    const { error } = opts;

    return error instanceof Error ? (error.stack ?? error.message) : error;
  }

  /** The HTTP status an engine error carries, from whichever shape holds it: `httpStatus` (typesense-js) or `response.status` (the Meilisearch SDK). `undefined` for a transport failure (connect, DNS, timeout), which has none. */
  static readHttpStatus(opts: { error: unknown }): number | undefined {
    const { error } = opts;

    if (!RecordUtility.isRecord(error)) {
      return undefined;
    }

    if (typeof error['httpStatus'] === 'number') {
      return error['httpStatus'];
    }

    const response = error['response'];

    return RecordUtility.isRecord(response) && typeof response['status'] === 'number'
      ? response['status']
      : undefined;
  }

  /** The message the engine answered with, `undefined` when it sent none. */
  static readEngineMessage(opts: { error: unknown }): string | undefined {
    const { error } = opts;

    if (!RecordUtility.isRecord(error)) {
      return undefined;
    }

    const message = error['message'];

    if (typeof message === 'string' && message.trim() !== '') {
      return message;
    }

    const cause = error['cause'];
    const causeMessage = RecordUtility.isRecord(cause) ? cause['message'] : undefined;

    return typeof causeMessage === 'string' && causeMessage.trim() !== ''
      ? causeMessage
      : undefined;
  }

  /**
   * The caller's own mistake, as the engine answered it: a 400 or 422 (the request is malformed or unprocessable), a 404
   * that no verb tolerated, a 409 (a conflict). Anything else - a 5xx, a 401/403 (this server's credentials are wrong, not
   * the caller's request), a 408 or 429 (try again later) - is not the caller's fault and stays a dependency failure.
   */
  static getClientError(opts: {
    method: string;
    error: unknown;
    details?: Record<string, unknown>;
  }): ApplicationError | undefined {
    const { method, error, details } = opts;
    const status = SearchConnectorInternal.readHttpStatus({ error });
    const engineMessage = SearchConnectorInternal.readEngineMessage({ error });
    const extra = details ? { extra: { details } } : {};
    const text = engineMessage ? ` ${engineMessage}` : '';

    if (status === HTTP.ResultCodes.RS_4.NotFound) {
      return getError({
        error: SearchErrors.NOT_FOUND,
        message: `[${method}] Not found in the search engine.${text}`,
        ...extra,
      });
    }

    if (status === HTTP.ResultCodes.RS_4.Conflict) {
      return getError({
        error: SearchErrors.ALREADY_EXISTS,
        message: `[${method}] The search engine reports a conflict.${text}`,
        ...extra,
      });
    }

    if (
      status === HTTP.ResultCodes.RS_4.BadRequest ||
      status === HTTP.ResultCodes.RS_4.UnprocessableEntity
    ) {
      return getError({
        statusCode: status,
        message: `[${method}] The search engine rejected the request.${text}`,
        ...extra,
      });
    }

    return undefined;
  }

  // Logs the full error internally and throws. An engine 400, 404, 409 or 422 is the caller's own mistake: it throws the matching 4xx with the engine's message kept, so a retry loop does not retry it. Every other failure (transport, 5xx, auth, rate limit) throws a sanitized 503 with zero internal leakage. `details` is caller-actionable progress info (counts, offsets) only, never engine detail.
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

    const clientError = SearchConnectorInternal.getClientError({ method, error, details });

    if (clientError) {
      Reflect.set(clientError, 'cause', error);
      throw clientError;
    }

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
