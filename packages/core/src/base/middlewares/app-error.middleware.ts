import { Environment, HTTP } from '@/common';
import { ApplicationLogger } from '@/helpers/logger';
import { ErrorHandler, HTTPResponseError } from 'hono/types';
import { RequestSpyMiddleware } from './request-spy.middleware';

const formatZodError = (opts: {
  env: string;
  requestId: string;
  url: string;
  path: string;
  error: Error | HTTPResponseError;
}) => {
  const { env, requestId, url, path, error } = opts;
  const statusCode = HTTP.ResultCodes.RS_4.UnprocessableEntity;

  let validationErrors = error;
  try {
    validationErrors = JSON.parse(error.message);
  } catch (parseError) {
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
        stack: env !== Environment.PRODUCTION ? error.stack : undefined,
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

export const appErrorHandler = (opts: { logger: ApplicationLogger }) => {
  const { logger = console } = opts;

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

    let statusCode =
      'status' in error
        ? error.status
        : 'statusCode' in error
          ? error.statusCode
          : HTTP.ResultCodes.RS_5.InternalServerError;

    if (error.name === 'ZodError') {
      const rs = formatZodError({
        env,
        requestId,
        url: context.req.url,
        path: context.req.path,
        error,
      });

      return context.json(rs.response, rs.statusCode);
    }

    return context.json(
      {
        message: error.message,
        statusCode,
        requestId,
        details: {
          url: context.req.url,
          path: context.req.path,
          stack: env !== 'production' ? error.stack : undefined,
          cause: env !== 'production' ? error.cause : undefined,
        },
      },
      statusCode as Parameters<typeof context.json>[1],
    );
  };

  return mw;
};
