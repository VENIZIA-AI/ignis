import { ApplicationLogger, Environment, HTTP } from '@venizia/ignis-helpers';
import { ErrorHandler, HTTPResponseError } from 'hono/types';
import { RequestSpyMiddleware } from './request-spy.middleware';

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
export const appErrorHandler = (opts: { logger: ApplicationLogger; rootKey?: string }) => {
  const { logger = console, rootKey = null } = opts;

  const mw: ErrorHandler = async (error, context) => {
    const requestId = context.get(RequestSpyMiddleware.REQUEST_ID_KEY);

    logger.error(
      '[onError][%s] REQUEST ERROR | path: %s | url: %s | Error: %s',
      requestId,
      context.req.path,
      context.req.url,
      error,
    );

    const env = context.env?.NODE_ENV || process.env.NODE_ENV;
    const isProduction = env?.toLowerCase() === Environment.PRODUCTION;

    const statusCode =
      'status' in error
        ? error.status
        : 'statusCode' in error
          ? error.statusCode
          : HTTP.ResultCodes.RS_5.InternalServerError;

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

    const rs = {
      message: error.message,
      statusCode,
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
      statusCode as Parameters<typeof context.json>[1],
    );
  };

  return mw;
};
