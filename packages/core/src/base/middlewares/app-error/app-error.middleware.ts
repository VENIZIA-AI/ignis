import type { Logger } from '@venizia/ignis-helpers';
import { Environment, HTTP, MessageCode } from '@venizia/ignis-helpers';
import type { ErrorHandler } from 'hono/types';
import { RequestSpyMiddleware } from '../request-spy';
import { isDatabaseClientError, isRetryableDatabaseError } from './database.handler';
import { DATABASE_RETRYABLE_ERROR_CODE, DATABASE_RETRYABLE_ERROR_MESSAGE } from './definition';
import { formatZodError } from './zod.handler';

const DEFAULT_INTERNAL_ERROR_MESSAGE = 'Internal Server Error';

/**
 * Application error handler (Hono `onError`). Routes each error to the right shape:
 * - ZodError → 422 via {@link formatZodError}
 * - DB client error (class 22/23/44) → 400 via {@link isDatabaseClientError}
 * - Transient DB conflict (40001/40P01) → 409 via {@link isRetryableDatabaseError}
 * - Intentional domain error (`getError`) → its own status/message
 * - Anything else → 500 (generic message in production)
 */
export const appErrorHandler = (opts: { logger: Logger; rootKey?: string }) => {
  const { logger = console, rootKey = null } = opts;

  const mw: ErrorHandler = async (error, context) => {
    const requestId = context.get(RequestSpyMiddleware.REQUEST_ID_KEY);

    logger.error(
      '[appErrorHandler][%s] REQUEST ERROR | path: %s | method: %s | url: %s | Error: %s',
      requestId,
      context.req.path,
      context.req.method,
      context.req.url,
      error,
    );

    const { NODE_ENV } = process.env;
    const env = [context.env?.NODE_ENV, NODE_ENV].find(Boolean);

    if (!env) {
      logger.error(
        '[appErrorHandler][%s] INVALID ENV IDENTIFIER | env: %s | path: %s | method: %s | url: %s | Error: %s',
        requestId,
        env,
        context.req.path,
        context.req.method,
        context.req.url,
        error,
      );
    }

    const isProduction = !env || !Environment.DEVELOPMENT_ENVS.has(env.toLowerCase());

    const statusCode =
      'statusCode' in error ? error.statusCode : HTTP.ResultCodes.RS_5.InternalServerError;

    const messageCode = MessageCode.resolve(
      'messageCode' in error ? (error.messageCode as string) : undefined,
    );

    if (error.name === 'ZodError') {
      const rs = formatZodError({
        isProduction,
        requestId,
        url: context.req.url,
        path: context.req.path,
        error,
      });

      return context.json(
        rootKey ? { [rootKey]: rs.response } : rs.response,
        rs.statusCode as Parameters<typeof context.json>[1],
      );
    }

    // Classify DB errors: client (400), transient/retryable conflict (409 Conflict), else server.
    const dbError = isDatabaseClientError({ error, isProduction });
    const isRetryable = !dbError.isClientError && isRetryableDatabaseError({ error });

    let resolvedStatusCode = statusCode;
    if (dbError.isClientError) {
      resolvedStatusCode = HTTP.ResultCodes.RS_4.BadRequest;
    } else if (isRetryable) {
      resolvedStatusCode = HTTP.ResultCodes.RS_4.Conflict;
    }

    let resolvedMessage = error.message;
    let resolvedMessageCode = messageCode;

    if (dbError.isClientError && dbError.message) {
      resolvedMessage = dbError.message;
    } else if (isRetryable) {
      // Transient conflict (deadlock / serialization failure) — safe generic message + retryable code.
      resolvedMessage = DATABASE_RETRYABLE_ERROR_MESSAGE;
      resolvedMessageCode = DATABASE_RETRYABLE_ERROR_CODE;
    } else if (isProduction && !('statusCode' in error)) {
      // Unexpected server error (uncaught throw, non-client DB error, connection failure): never
      // leak the raw message in production — it may carry SQL, schema names, or connection details.
      resolvedMessage = DEFAULT_INTERNAL_ERROR_MESSAGE;
    }

    const rs = {
      message: resolvedMessage,
      messageCode: resolvedMessageCode,
      statusCode: resolvedStatusCode,
      requestId,
      extra: 'extra' in error ? error?.extra : undefined,
      details: {
        url: context.req.url,
        path: context.req.path,
        stack: !isProduction ? error.stack : undefined,
        cause: !isProduction ? error.cause : undefined,
      },
    };

    return context.json(
      rootKey ? { [rootKey]: rs } : rs,
      resolvedStatusCode as Parameters<typeof context.json>[1],
    );
  };

  return mw;
};
