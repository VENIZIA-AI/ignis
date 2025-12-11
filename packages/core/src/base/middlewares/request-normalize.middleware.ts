import { HTTP } from '@venizia/ignis-helpers';
import type { MiddlewareHandler } from 'hono';
import { createMiddleware } from 'hono/factory';

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

        await context.req.json();
      }
    }

    return next();
  });

  return mw;
};
