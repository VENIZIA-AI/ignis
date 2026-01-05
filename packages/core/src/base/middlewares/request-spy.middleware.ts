import { BaseHelper } from '@venizia/ignis-helpers';
import { IProvider } from '@venizia/ignis-inversion';
import { createMiddleware } from 'hono/factory';
import { MiddlewareHandler } from 'hono/types';

/**
 * `RequestSpyMiddleware` is a middleware that logs incoming and outgoing request information.
 * It extends `BaseHelper` and implements `IProvider<MiddlewareHandler>` to provide a Hono middleware.
 */
export class RequestSpyMiddleware extends BaseHelper implements IProvider<MiddlewareHandler> {
  static readonly REQUEST_ID_KEY = 'requestId';

  constructor() {
    super({ scope: RequestSpyMiddleware.name });
  }

  /* validateStrictCondition<RequestContext extends Context>(opts: { context: RequestContext }) {
        const { context } = opts;

        const requestId = context.get(RequestSpyMiddleware.REQUEST_ID_KEY);
        if (isStrict.requestId && !requestId) {
          throw getError({
            statusCode: HTTP.ResultCodes.RS_4.BadRequest,
            message: '[validate] Malformed/Missing remote request ID!',
          });
        }
      } */

  /**
   * Returns a Hono middleware handler that logs request details at the start and end of a request.
   * It captures request ID, forwarded IP, URL, method, path, query, and body, and logs the request duration.
   *
   * @returns A `MiddlewareHandler` function.
   */
  value() {
    return createMiddleware(async (context, next) => {
      const t = performance.now();
      const { req } = context;

      const requestId = context.get(RequestSpyMiddleware.REQUEST_ID_KEY);
      const forwardedIp = req.header('x-real-ip') ?? req.header['x-forwarded-for'] ?? 'N/A';

      // console.log(getConnInfo(context));

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
