import { getError } from '@venizia/ignis-helpers/core';
import type { Context, MiddlewareHandler } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { RequestErrors } from '../middlewares/common/errors';

/** Marks a middleware as the body limit of ONE route. A registry symbol, so two installed copies of this package still read each other's marks. */
const ROUTE_BODY_LIMIT: unique symbol = Symbol.for(
  '@venizia/ignis-kernel/route-body-limit',
) as never;

/**
 * The request body limit: the default every route gets, and the limit one route sets for itself.
 *
 * The application installs the default (`DEFAULT_MAX_SIZE`) ahead of every other middleware, so no route reads
 * a body over it. A route that takes larger bodies (an upload, an import) puts `BodyLimits.route({ maxSize })`
 * in its `middleware`: the default steps aside for that route and this limit answers instead. The limit counts
 * the bytes that arrive, so a chunked body with no `Content-Length` is held to it too.
 */
export class BodyLimits {
  /** The default of every route: 5 MiB. */
  static readonly DEFAULT_MAX_SIZE = 5 * 1024 * 1024;

  /** The limiter itself: a body over `maxSize` bytes is the framework's 413, or the `onError` answer. */
  static limiter(opts: {
    maxSize: number;
    onError?: (context: Context) => Response | Promise<Response>;
  }): MiddlewareHandler {
    const { maxSize, onError } = opts;

    return bodyLimit({
      maxSize,
      onError:
        onError ??
        (() => {
          throw getError({
            error: RequestErrors.BODY_TOO_LARGE,
            message: `Request body exceeds the maximum of ${maxSize} bytes`,
          });
        }),
    });
  }

  /**
   * The limit of one route, to put in the route's `middleware`. It replaces the default for this route, larger or smaller.
   * A body larger than the host accepts at all (`configs.server.maxRequestBodySize`, Bun's own cap) is still refused there.
   */
  static route(opts: {
    maxSize: number;
    onError?: (context: Context) => Response | Promise<Response>;
  }): MiddlewareHandler {
    const { maxSize } = opts;

    if (typeof maxSize !== 'number' || !Number.isFinite(maxSize) || maxSize < 0) {
      throw getError({
        message: `[BodyLimits.route] maxSize must be a non-negative number of bytes | value: ${String(maxSize)}`,
      });
    }

    return Object.assign(BodyLimits.limiter(opts), { [ROUTE_BODY_LIMIT]: maxSize });
  }

  /** Whether the route this request matched carries its own limit, so the default stands aside. */
  static hasRouteLimit(context: Context): boolean {
    return context.req.matchedRoutes.some(
      (matched) =>
        (matched.handler as unknown as Record<symbol, unknown>)[ROUTE_BODY_LIMIT] !== undefined,
    );
  }
}
