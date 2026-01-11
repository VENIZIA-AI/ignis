import { Logger, Environment, HTTP } from '@venizia/ignis-helpers';
import { ErrorHandler, HTTPResponseError } from 'hono/types';
import { RequestSpyMiddleware } from './request-spy.middleware';

/**
 * PostgreSQL SQLSTATE error codes for integrity constraint violations (Class 23).
 * These are client errors and should return HTTP 400, not 500.
 * @see https://www.postgresql.org/docs/current/errcodes-appendix.html
 */
const PostgresErrorCodes = {
  UNIQUE_VIOLATION: '23505',
  FOREIGN_KEY_VIOLATION: '23503',
  NOT_NULL_VIOLATION: '23502',
  CHECK_VIOLATION: '23514',
  EXCLUSION_VIOLATION: '23P01',
  INVALID_TEXT_REPRESENTATION: '22P02',
  NUMERIC_VALUE_OUT_OF_RANGE: '22003',
  STRING_DATA_TOO_LONG: '22001',
} as const;

const DATABASE_CLIENT_ERROR_MESSAGES: Record<string, string> = {
  [PostgresErrorCodes.UNIQUE_VIOLATION]: 'Unique constraint violation',
  [PostgresErrorCodes.FOREIGN_KEY_VIOLATION]: 'Foreign key constraint violation',
  [PostgresErrorCodes.NOT_NULL_VIOLATION]: 'Not null constraint violation',
  [PostgresErrorCodes.CHECK_VIOLATION]: 'Check constraint violation',
  [PostgresErrorCodes.EXCLUSION_VIOLATION]: 'Exclusion constraint violation',
  [PostgresErrorCodes.INVALID_TEXT_REPRESENTATION]: 'Invalid text representation',
  [PostgresErrorCodes.NUMERIC_VALUE_OUT_OF_RANGE]: 'Numeric value out of range',
  [PostgresErrorCodes.STRING_DATA_TOO_LONG]: 'String data too long',
};

/**
 * Checks if error is a database constraint error that should return 400.
 * Returns a formatted, human-readable message.
 */
const isDatabaseClientError = (opts: {
  error: Error;
}): { isClientError: boolean; message?: string } => {
  const { error } = opts;
  const errorAny = error as any;
  const cause = errorAny.cause;
  const code = errorAny.code || cause?.code;

  if (code && DATABASE_CLIENT_ERROR_MESSAGES[code]) {
    const baseMessage = DATABASE_CLIENT_ERROR_MESSAGES[code];
    const detail = cause?.detail;
    const table = cause?.table;
    const constraint = cause?.constraint;

    // Build readable message with line breaks
    const lines = [baseMessage];
    if (detail) {
      lines.push(`Detail: ${detail}`);
    }
    if (table) {
      lines.push(`Table: ${table}`);
    }
    if (constraint) {
      lines.push(`Constraint: ${constraint}`);
    }

    return {
      isClientError: true,
      message: lines.join('\n'),
    };
  }

  return { isClientError: false };
};

const formatZodError = (opts: {
  isProduction: boolean;
  requestId: string;
  url: string;
  path: string;
  error: Error | HTTPResponseError;
}) => {
  const { isProduction, requestId, url, path, error } = opts;
  const statusCode = HTTP.ResultCodes.RS_4.UnprocessableEntity;

  let validationErrors = error;
  try {
    validationErrors = JSON.parse(error.message);
  } catch (_) {
    validationErrors = error;
  }

  return {
    statusCode,
    response: {
      message: 'ValidationError',
      statusCode,
      requestId,
      details: {
        url,
        path,
        stack: !isProduction ? error.stack : undefined,
        cause: Array.isArray(validationErrors)
          ? validationErrors.map(el => ({
              path: el.path.join('.') || 'root',
              message: el.message,
              code: el.code,
              expected: el.expected,
              received: el.received,
            }))
          : validationErrors,
      },
    },
  };
};

/**
 * Creates an error handling middleware for the application.
 * This middleware catches errors, logs them, and formats the response for the client.
 * It also handles `ZodError` specifically for validation errors.
 *
 * @param opts - Options for the error handler.
 * @param opts.logger - The application logger instance. Defaults to `console`.
 * @param opts.rootKey - Optional: A key to wrap the error response in.
 * @returns An `ErrorHandler` middleware function.
 */
export const appErrorHandler = (opts: { logger: Logger; rootKey?: string }) => {
  const { logger = console, rootKey = null } = opts;

  const mw: ErrorHandler = async (error, context) => {
    const requestId = context.get(RequestSpyMiddleware.REQUEST_ID_KEY);

    logger.error(
      '[onError][%s] REQUEST ERROR | path: %s | url: %s | Error: %j',
      requestId,
      context.req.path,
      context.req.url,
      error,
    );

    const env = context.env?.NODE_ENV || process.env.NODE_ENV;
    const isProduction = env?.toLowerCase() === Environment.PRODUCTION;

    const statusCode =
      'statusCode' in error ? error.statusCode : HTTP.ResultCodes.RS_5.InternalServerError;

    if (error.name === 'ZodError') {
      const rs = formatZodError({
        isProduction,
        requestId,
        url: context.req.url,
        path: context.req.path,
        error,
      });

      return context.json(rs.response, rs.statusCode);
    }

    // Determine if this is a database client error (should be 400, not 500)
    const dbError = isDatabaseClientError({ error });
    const resolvedStatusCode = dbError.isClientError
      ? HTTP.ResultCodes.RS_4.BadRequest
      : statusCode;
    const resolvedMessage =
      dbError.isClientError && dbError.message ? dbError.message : error.message;

    const rs = {
      message: resolvedMessage,
      statusCode: resolvedStatusCode,
      requestId,
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
