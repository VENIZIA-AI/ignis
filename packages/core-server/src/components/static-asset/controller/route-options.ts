import { HTTP } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';
import { BodyLimits } from '@venizia/ignis-kernel';
import type { MiddlewareHandler } from 'hono';
import { StaticAssetErrors, type TStaticAssetRouteConfig } from '../common';

export class AssetRouteOptions {
  /** Multipart framing of one file (boundary, `Content-Disposition` with a file name, `Content-Type`), allowed on top of its `maxBytes` in the route's body limit. */
  static readonly ENVELOPE_BYTES_PER_FILE = 4 * 1024;

  /** The non-file parts of an upload (policy fields, the closing boundary), allowed once in the route's body limit. */
  static readonly ENVELOPE_BYTES_BASE = 64 * 1024;

  /** Splits the `enabled` switch off the route config: it is this component's field, never a Hono one. */
  static readOverride(opts: { route?: TStaticAssetRouteConfig }): {
    isEnabled: boolean;
    override: Omit<TStaticAssetRouteConfig, 'enabled'>;
  } {
    const { enabled, ...override } = opts.route ?? {};

    return { isEnabled: enabled !== false, override };
  }

  /**
   * The route's body validator reads the whole multipart body, so a declared length checked in the
   * handler arrives too late to save any memory. Appended after the application's own middleware, so
   * a check of its own still answers first.
   *
   * The route also sets its own body limit: `maxFiles` files of `maxBytes` each, plus their multipart framing. An
   * upload route that accepts more than the 5 MiB default would otherwise be held to the default, and a chunked body,
   * which has no declared length, is counted too. The per-file check in the handler still decides each file.
   */
  static appendLengthGuard(opts: {
    middleware: TStaticAssetRouteConfig['middleware'];
    maxBytes: number;
    maxFiles: number;
  }): NonNullable<TStaticAssetRouteConfig['middleware']> {
    const { middleware, maxBytes, maxFiles } = opts;

    const guard: MiddlewareHandler = async (context, next) => {
      const declaredLength = Number(context.req.header(HTTP.Headers.CONTENT_LENGTH));

      // Not authoritative: a multipart envelope is larger than its files, so the per-file check in the handler decides.
      if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
        throw getError({
          error: StaticAssetErrors.UPLOAD_TOO_LARGE,
          message: `Request body of ${declaredLength} bytes exceeds the maximum of ${maxBytes}`,
        });
      }

      await next();
    };

    const limit = BodyLimits.route({
      maxSize:
        maxFiles * (maxBytes + AssetRouteOptions.ENVELOPE_BYTES_PER_FILE) +
        AssetRouteOptions.ENVELOPE_BYTES_BASE,
    });

    if (!middleware) {
      return [guard, limit];
    }

    return Array.isArray(middleware) ? [...middleware, guard, limit] : [middleware, guard, limit];
  }
}
