import { HTTP } from '@/common/constants';
import { ApplicationLogger } from '@/helpers/logger';
import { NotFoundHandler } from 'hono/types';

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
