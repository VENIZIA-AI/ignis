import { NetworkUtility } from '@/utilities/network.utility';
import { Environment } from '@venizia/ignis-helpers';
import { BaseHelper, EnvironmentNames, getError } from '@venizia/ignis-helpers/core';
import { HTTP } from '@venizia/ignis-helpers/common';
import type { IProvider } from '@venizia/ignis-inversion';
import { createMiddleware } from 'hono/factory';
import type { MiddlewareHandler } from 'hono/types';
import { REQUEST_ID_KEY, RequestErrors, type TContext } from '@venizia/ignis-kernel';

const TEXT_CONTENT_TYPE_PREFIX = 'text/';

/** Logs incoming/outgoing request details. The BODY is parsed and logged only in a recognised development environment - see the constructor for why that test is fail-closed; elsewhere only a JSON body is parsed, for its malformed-body 400. */
export class RequestSpyMiddleware extends BaseHelper implements IProvider<MiddlewareHandler> {
  static readonly REQUEST_ID_KEY = REQUEST_ID_KEY;

  private isDebugMode: boolean;

  /**
   * Fail-CLOSED, matching {@link BaseAppErrorMiddleware.isProduction}: only an environment this
   * framework recognises as a development one enables body logging.
   *
   * The previous test was `env !== 'production'`, which enabled it for an unset `NODE_ENV` and for
   * every pre-production name that carries real user data - `staging`, `uat`, `alpha`, `beta`, and
   * the abbreviation `prod`. `development-envs.test.ts` pins those as NOT development for exactly
   * that reason. Redaction is no defence here: it masks secret-SHAPED keys, so `nationalId`,
   * `cardNumber` and `ssn` were written verbatim.
   */
  constructor() {
    super({ scope: 'SpyMW' });
    const env = Environment.ambient?.toLowerCase();
    this.isDebugMode = !!env && EnvironmentNames.DEVELOPMENT_ENVS.has(env);
  }

  /** Parses the body by Content-Type without draining it for the handler: JSON and form bodies go through the request cache, `text/*` is read from a clone (from the cache once something read it), and any other type is described by its size, never read. */
  async parseBody(opts: { req: TContext['req'] }): Promise<unknown> {
    const contentType = opts.req.header(HTTP.Headers.CONTENT_TYPE);

    if (!contentType) {
      return null;
    }

    // Only an explicit zero short-circuits: a CHUNKED request carries no Content-Length, so gating on the header's presence would skip every streamed body and let a malformed one detonate deeper as a 500.
    const contentLength = opts.req.header(HTTP.Headers.CONTENT_LENGTH);
    if (contentLength === '0' || !opts.req.raw.body) {
      return null;
    }

    try {
      if (contentType.includes(HTTP.HeaderValues.APPLICATION_JSON)) {
        const rs = await opts.req.json();
        return rs;
      }

      if (
        contentType.includes(HTTP.HeaderValues.MULTIPART_FORM_DATA) ||
        contentType.includes(HTTP.HeaderValues.APPLICATION_FORM_URLENCODED)
      ) {
        const rs = await opts.req.parseBody();
        return rs;
      }

      if (contentType === HTTP.HeaderValues.APPLICATION_OCTET_STREAM) {
        return opts.req.raw.body;
      }

      // Anything else is read, if at all, from a clone: a handler may stream `req.raw.body` on (an upload proxy), and reading the request itself would drain it and mangle binary bytes.
      // A body an earlier middleware read cannot be cloned; Hono's cache serves it instead.
      if (contentType.startsWith(TEXT_CONTENT_TYPE_PREFIX)) {
        const rs = opts.req.raw.bodyUsed
          ? await opts.req.text()
          : await opts.req.raw.clone().text();
        return rs;
      }

      return `<${contentLength ?? 'unknown'} bytes, ${contentType}>`;
    } catch {
      throw getError({
        error: RequestErrors.BODY_MALFORMED,
        message: 'Malformed Body Payload',
      });
    }
  }

  /** Returns a Hono middleware that logs request details and duration. */
  value() {
    return createMiddleware(async (context, next) => {
      const t = performance.now();
      const { req } = context;

      const requestId = context.get(RequestSpyMiddleware.REQUEST_ID_KEY);
      const incomingIp = NetworkUtility.getIncomingIp(context);
      const forwardedIp = req.header('x-real-ip') ?? req.header('x-forwarded-for') ?? null;

      const method = req.method;
      const path = req.path ?? '/';

      // Best-effort, never fatal: a unix socket, some proxies and any in-process call yield no connection info - refusing to serve because the client IP is unknown turns a logging gap into an outage.
      const clientIp = incomingIp ?? forwardedIp ?? 'unknown';
      const query = req.query() ?? {};

      if (this.isDebugMode) {
        const body = await this.parseBody({ req });
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
        // Only JSON is parsed here: its clean 400 on a malformed body is a contract. Any other body
        // would be read for a log line that never prints it, before the route's own size checks.
        if (req.header(HTTP.Headers.CONTENT_TYPE)?.includes(HTTP.HeaderValues.APPLICATION_JSON)) {
          await this.parseBody({ req });
        }

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
