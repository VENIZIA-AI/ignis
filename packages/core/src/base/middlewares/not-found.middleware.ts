import { Logger, HTTP } from '@venizia/ignis-helpers';
import { NotFoundHandler } from 'hono/types';
import { RequestSpyMiddleware } from './request-spy.middleware';

/**
 * Creates a not found handling middleware for the application.
 * This middleware logs requests to unknown URLs and returns a JSON 404 response.
 *
 * @param opts - Options for the not found handler.
 * @param opts.logger - The application logger instance. Defaults to `console`.
 * @returns A `NotFoundHandler` middleware function.
 */
export const notFoundHandler = (opts: { logger?: Logger }) => {
  const { logger = console } = opts;

  const mw: NotFoundHandler = async context => {
    const requestId = context.get(RequestSpyMiddleware.REQUEST_ID_KEY);

    logger.error(
      '[%s] URL NOT FOUND | path: %s | url: %s',
      requestId,
      context.req.path,
      context.req.url,
    );

    return context.json(
      {
        message: 'URL NOT FOUND',
        statusCode: HTTP.ResultCodes.RS_4.NotFound,
        requestId,
        path: context.req.path,
        url: context.req.url,
      },
      HTTP.ResultCodes.RS_4.NotFound,
    );
  };

  return mw;
};
