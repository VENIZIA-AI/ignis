import type { ILogger } from '@venizia/ignis-helpers/core';
import { HTTP } from '@venizia/ignis-helpers/common';
import type { NotFoundHandler } from 'hono/types';
import { REQUEST_ID_KEY } from '../common';

export const notFoundHandler = (opts: { logger?: ILogger }) => {
  const { logger = console } = opts;

  const mw: NotFoundHandler = async context => {
    const requestId = context.get(REQUEST_ID_KEY);

    // WARN, not ERROR: an unrouted path is the callers mistake, and this middleware is installed
    // unconditionally - so scanner traffic filled the dedicated error log and tripped error-volume
    // alerting. The same reasoning is already applied to an expired token elsewhere in the tree.
    logger.warn(
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
