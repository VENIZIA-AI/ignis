import { HTTP } from '@/common';
import { ApplicationLogger } from '@/helpers/logger';
import { ErrorHandler } from 'hono/types';

export const appErrorHandler = (opts: { logger: ApplicationLogger }) => {
  const { logger = console } = opts;

  const mw: ErrorHandler = async (error, context) => {
    logger.error(
      '[onError] REQUEST ERROR | path: %s | url: %s | Error: %s',
      context.req.path,
      context.req.url,
      error,
    );

    const env = context.env?.NODE_ENV || process.env.NODE_ENV;

    return context.json(
      {
        message: error.message,
        statusCode: 'status' in error ? error.status : HTTP.ResultCodes.RS_5.InternalServerError,
        stack: env !== 'production' ? error.stack : undefined,
        cause: env !== 'production' ? error.cause : undefined,
        url: context.req.url,
        path: context.req.path,
      },
      HTTP.ResultCodes.RS_5.InternalServerError,
    );
  };

  return mw;
};
