import { getError, HTTP } from '@venizia/ignis-helpers';
import type { MiddlewareHandler } from 'hono';
import { createMiddleware } from 'hono/factory';

/**
 * Creates a middleware that normalizes incoming requests.
 * Specifically, for non-GET/OPTIONS requests with a 'Content-Length' and 'Content-Type: application/json' header,
 * it attempts to parse the request body as JSON to ensure it's accessible later in the request lifecycle.
 *
 * @returns A `MiddlewareHandler` function.
 */
export const requestNormalize = (): MiddlewareHandler => {
  const mw = createMiddleware(async (context, next) => {
    const requestMethod = context.req.method.toLowerCase();
    switch (requestMethod) {
      case 'get':
      case 'options': {
        break;
      }
      default: {
        const contentLength = context.req.header('Content-Length');
        if (!contentLength || contentLength === '0') {
          break;
        }

        const contentType = context.req.header('Content-Type');
        if (!contentType) {
          break;
        }

        if (!contentType.startsWith(HTTP.HeaderValues.APPLICATION_JSON)) {
          break;
        }

        try {
          await context.req.json();
        } catch {
          throw getError({
            statusCode: HTTP.ResultCodes.RS_4.BadRequest,
            message: 'Malformed JSON payload',
          });
        }
      }
    }

    return next();
  });

  return mw;
};
