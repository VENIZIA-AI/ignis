import type { MiddlewareHandler } from 'hono';
import { createMiddleware } from 'hono/factory';

/**
 * Creates a middleware that serves an emoji as a favicon.
 *
 * @param opts - Options for the emoji favicon middleware.
 * @param opts.icon - The emoji character to use as the favicon.
 * @returns A `MiddlewareHandler` function.
 */
export const emojiFavicon = (opts: { icon: string }): MiddlewareHandler => {
  const { icon } = opts;

  const mw = createMiddleware(async (context, next) => {
    if (context.req.path !== '/favicon.ico') {
      return next();
    }

    context.res.headers.set('content-type', 'image/svg+xml');
    return context.body(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" x="-0.1em" font-size="90">${icon}</text></svg>`,
    );
  });

  return mw;
};
