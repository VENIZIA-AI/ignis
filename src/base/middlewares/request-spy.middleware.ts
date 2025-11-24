import { IProvider } from '@/common';
import { createMiddleware } from 'hono/factory';
import { MiddlewareHandler } from 'hono/types';
import { BaseHelper } from '../helpers';

export class RequestSpyMiddleware extends BaseHelper implements IProvider<MiddlewareHandler> {
  static readonly REQUEST_ID_KEY = 'requestId';

  constructor() {
    super({ scope: RequestSpyMiddleware.name });
  }

  value() {
    return createMiddleware(async (context, next) => {
      const t = performance.now();
      const { req } = context;

      const requestId = context.get(RequestSpyMiddleware.REQUEST_ID_KEY);
      const forwardedIp = req.header('x-real-ip') ?? req.header['x-forwarded-for'] ?? 'N/A';

      const requestUrl = decodeURIComponent(req.url)?.replace(/(?:\r\n|\r|\n| )/g, '');
      const remark = {
        id: requestId,
        url: requestUrl,
        method: req.method,
        path: req.path ?? '',
        query: req.query() ?? {},
        body: req.parseBody(),
      };

      this.logger.info(
        '[spy][%s] START\t| Handling Request | forwardedIp: %s | path: %s | method: %s',
        requestId,
        forwardedIp,
        remark.path,
        remark.method,
      );

      await next();

      this.logger.info(
        '[spy][%s] DONE\t| Handling Request | forwardedIp: %s | path: %s | method: %s | Took: %s (ms)',
        requestId,
        forwardedIp,
        remark.path,
        remark.method,
        performance.now() - t,
      );
    });
  }
}
