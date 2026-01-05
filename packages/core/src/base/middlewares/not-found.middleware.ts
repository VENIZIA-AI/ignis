import { ApplicationLogger, HTTP } from '@venizia/ignis-helpers';
import { NotFoundHandler } from 'hono/types';

/**
 * Creates a not found handling middleware for the application.
 * This middleware logs requests to unknown URLs and returns a JSON 404 response.
 *
 * @param opts - Options for the not found handler.
 * @param opts.logger - The application logger instance. Defaults to `console`.
 * @returns A `NotFoundHandler` middleware function.
 */
export const notFoundHandler = (opts: { logger?: ApplicationLogger }) => {
  const { logger = console } = opts;

  const mw: NotFoundHandler = async context => {
    logger.error(
      '[server][notFound] URL NOT FOUND | path: %s | url: %s',
      context.req.path,
      context.req.url,
    );
    return context.json(
      { message: 'URL NOT FOUND', path: context.req.path, url: context.req.url },
      HTTP.ResultCodes.RS_4.NotFound,
    );
  };

  return mw;
};
