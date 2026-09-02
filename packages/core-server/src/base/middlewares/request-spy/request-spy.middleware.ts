import { NetworkUtility } from '@/utilities/network.utility';
import { Environment } from '@venizia/ignis-helpers';
import { BaseHelper, EnvironmentNames, getError } from '@venizia/ignis-helpers/core';
import { HTTP } from '@venizia/ignis-helpers/common';
import type { IProvider } from '@venizia/ignis-inversion';
import { createMiddleware } from 'hono/factory';
import type { MiddlewareHandler } from 'hono/types';
import { REQUEST_ID_KEY, RequestErrors, type TContext } from '@venizia/ignis-kernel';

/** Logs incoming/outgoing request details. The BODY is logged only in a recognised development environment - see the constructor for why that test is fail-closed. */
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

  /** Parses request body based on Content-Type header. */
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

      const rs = await opts.req.text();
      return rs;
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
