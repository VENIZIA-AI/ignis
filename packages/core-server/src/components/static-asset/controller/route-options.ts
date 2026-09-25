import { HTTP } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';
import type { MiddlewareHandler } from 'hono';
import { StaticAssetErrors, type TStaticAssetRouteConfig } from '../common';

/** Splits the `enabled` switch off the route config: it is this component's field, never a Hono one. */
export const readRouteOverride = (opts: {
  route?: TStaticAssetRouteConfig;
}): { isEnabled: boolean; override: Omit<TStaticAssetRouteConfig, 'enabled'> } => {
  const { enabled, ...override } = opts.route ?? {};
  return { isEnabled: enabled !== false, override };
};

/**
 * The route's body validator reads the whole multipart body, so a declared length checked in the
 * handler arrives too late to save any memory. Appended after the application's own middleware, so
 * a check of its own still answers first.
 */
export const appendDeclaredLengthGuard = (opts: {
  middleware: TStaticAssetRouteConfig['middleware'];
  maxBytes: number;
}): NonNullable<TStaticAssetRouteConfig['middleware']> => {
  const { middleware, maxBytes } = opts;

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

  if (!middleware) {
    return [guard];
  }

  return Array.isArray(middleware) ? [...middleware, guard] : [middleware, guard];
};
