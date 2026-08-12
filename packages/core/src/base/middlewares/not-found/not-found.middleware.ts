import type { ILogger } from '@venizia/ignis-helpers/core';
import { HTTP } from '@venizia/ignis-helpers/common';
import type { NotFoundHandler } from 'hono/types';
import { RequestSpyMiddleware } from '../request-spy';

export const notFoundHandler = (opts: { logger?: ILogger }) => {
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
