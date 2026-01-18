import { getIncomingIp } from '@/utilities/network.utility';
import { BaseHelper, Environment, getError, HTTP } from '@venizia/ignis-helpers';
import { IProvider } from '@venizia/ignis-inversion';
import { createMiddleware } from 'hono/factory';
import { MiddlewareHandler } from 'hono/types';
import { TContext } from '../controllers';

/**
 * `RequestSpyMiddleware` is a middleware that logs incoming and outgoing request information.
 * It extends `BaseHelper` and implements `IProvider<MiddlewareHandler>` to provide a Hono middleware.
 *
 * Note: Request body and query params are only logged in non-production environments
 * to prevent sensitive data exposure in production logs.
 */
export class RequestSpyMiddleware extends BaseHelper implements IProvider<MiddlewareHandler> {
  static readonly REQUEST_ID_KEY = 'requestId';

  private isDebugMode: boolean;

  constructor() {
    super({ scope: 'SpyMW' });
    const env = process.env.NODE_ENV?.toLowerCase();
    this.isDebugMode = env !== Environment.PRODUCTION;
  }

  /**
   * Parses request body based on Content-Type header.
   * - application/json → req.json()
   * - multipart/form-data, application/x-www-form-urlencoded → req.parseBody()
   * - Other content types (text, html, xml, etc.) → req.text()
   */
  async parseBody(opts: { req: TContext['req'] }): Promise<unknown> {
    const contentType = opts.req.header(HTTP.Headers.CONTENT_TYPE);

    // No Content-Type header means no body
    if (!contentType) {
      return null;
    }

    const contentLength = opts.req.header(HTTP.Headers.CONTENT_LENGTH);
    if (!contentLength || contentLength === '0') {
      return null;
    }

    try {
      // JSON body
      if (contentType.includes(HTTP.HeaderValues.APPLICATION_JSON)) {
        const rs = await opts.req.json();
        return rs;
      }

      // Form data (multipart or urlencoded)
      if (
        contentType.includes(HTTP.HeaderValues.MULTIPART_FORM_DATA) ||
        contentType.includes(HTTP.HeaderValues.APPLICATION_FORM_URLENCODED)
      ) {
        const rs = await opts.req.parseBody();
        return rs;
      }

      // Everything else (text, html, xml, etc.) - read as text
      const rs = await opts.req.text();
      return rs;
    } catch {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_4.BadRequest,
        message: 'Malformed Body Payload',
      });
    }
  }

  /**
   * Returns a Hono middleware handler that logs request details at the start and end of a request.
   * It captures request ID, IPs, URL, method, path, query, body, and logs the request duration.
   *
   * @returns A `MiddlewareHandler` function.
   */
  value() {
    return createMiddleware(async (context, next) => {
      const t = performance.now();
      const { req } = context;

      const requestId = context.get(RequestSpyMiddleware.REQUEST_ID_KEY);
      const incomingIp = getIncomingIp(context);
      const forwardedIp = req.header('x-real-ip') ?? req.header('x-forwarded-for') ?? null;

      if (!incomingIp && !forwardedIp) {
        throw getError({
          statusCode: HTTP.ResultCodes.RS_4.BadRequest,
          message: 'Malformed Connection Info',
        });
      }

      const method = req.method;
      const path = req.path ?? '/';
      const clientIp = incomingIp ?? forwardedIp;
      const query = req.query() ?? {};
      const body = await this.parseBody(context);

      if (this.isDebugMode) {
        this.logger.info(
          '[%s][%s][=>] %s %s | query: %j | body: %j',
          requestId,
          clientIp,
          method.padEnd(8, ' '),
          path,
          query,
          body,
        );
      } else {
        this.logger.info(
          '[%s][%s][=>] %s %s | query: %j',
          requestId,
          clientIp,
          method.padEnd(8, ' '),
          path,
          query,
        );
      }

      await next();

      const duration = (performance.now() - t).toFixed(2);
      this.logger.info(
        '[%s][%s][<=] %s %s | Took: %s (ms)',
        requestId,
        clientIp,
        method.padEnd(8, ' '),
        path,
        duration,
      );
    });
  }
}
