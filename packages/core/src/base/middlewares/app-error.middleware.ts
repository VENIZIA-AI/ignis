import { HTTP } from '@/common';
import { ApplicationLogger } from '@/helpers/logger';
import { ErrorHandler } from 'hono/types';
import { RequestSpyMiddleware } from './request-spy.middleware';

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

    const statusCode =
      'status' in error
        ? error.status
        : 'statusCode' in error
          ? error.statusCode
          : HTTP.ResultCodes.RS_5.InternalServerError;

    return context.json(
      {
        message: error.message,
        statusCode,
        requestId,
        stack: env !== 'production' ? error.stack : undefined,
        cause: env !== 'production' ? error.cause : undefined,
        url: context.req.url,
        path: context.req.path,
      },
      statusCode as Parameters<typeof context.json>[1],
    );
  };

  return mw;
};
