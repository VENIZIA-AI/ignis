import { HTTP } from '@venizia/ignis-helpers/common';
import type { MiddlewareHandler } from 'hono';
import { createMiddleware } from 'hono/factory';

/** Factory for a middleware that answers `/favicon.ico` with an emoji rendered as SVG. */
export class EmojiFaviconMiddleware {
  /** Serves an emoji as an SVG favicon on /favicon.ico. */
  static create(opts: { icon: string }): MiddlewareHandler {
    const { icon } = opts;

    const mw = createMiddleware(async (context, next) => {
      if (context.req.path !== '/favicon.ico') {
        return next();
      }

      context.res.headers.set(HTTP.Headers.CONTENT_TYPE, HTTP.HeaderValues.IMAGE_SVG);

      return context.body(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" x="-0.1em" font-size="90">${icon}</text></svg>`,
      );
    });

    return mw;
  }
}
