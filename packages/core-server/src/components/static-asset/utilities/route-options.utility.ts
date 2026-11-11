import { HTTP } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';
import { BodyLimits, RouteConfigResolver } from '@venizia/ignis-kernel';
import type { MiddlewareHandler } from 'hono';
import type { IAuthRouteConfig, TRouteAuthConfig } from '@/base';
import {
  StaticAssetErrors,
  type TStaticAssetRouteConfig,
  type TStaticAssetRouteKey,
} from '../common';
import type { IStaticAssetResolvedEntry, IStaticAssetResolvedRoute } from './entry.utility';

/** What a route is registered with: the application's overrides, and the auth it ends up with. */
export type TStaticAssetRouteOverride = Omit<
  TStaticAssetRouteConfig,
  'authenticate' | 'authorize'
> &
  Pick<IAuthRouteConfig, 'authenticate' | 'authorize'>;

export class StaticAssetRouteOptionsUtility {
  /** Multipart framing of one file (boundary, `Content-Disposition` with a file name, `Content-Type`), allowed on top of its `maxBytes` in the route's body limit. */
  static readonly ENVELOPE_BYTES_PER_FILE = 4 * 1024;

  /** The non-file parts of an upload (policy fields, the closing boundary), allowed once in the route's body limit. */
  static readonly ENVELOPE_BYTES_BASE = 64 * 1024;

  /** The routes `auth.publicRead` leaves open: reading ONE object. Listing is not reading an object. */
  private static readonly PUBLIC_READ_ROUTES: ReadonlySet<TStaticAssetRouteKey> = new Set([
    'getObjectByName',
    'downloadObjectByName',
  ]);

  /**
   * Reads one built-in route's configuration: whether it is registered, the Hono overrides, and the
   * authentication and authorization it ends up with.
   *
   * Auth is resolved by the same resolver the CRUD factory uses: a route's own config beats the
   * entry's `auth`, and `{ skip: true }` opens the route. `publicRead` is the entry's default for
   * the two read routes and loses to any auth the route sets itself.
   */
  static readRoute(opts: {
    key: TStaticAssetRouteKey;
    route?: IStaticAssetResolvedRoute;
    auth?: IStaticAssetResolvedEntry<never>['auth'];
  }): { isEnabled: boolean; override: TStaticAssetRouteOverride } {
    const { key, route, auth } = opts;
    const { authenticate, authorize, ...override } = route?.override ?? {};

    const isPublicRead =
      auth?.isPublicRead === true &&
      StaticAssetRouteOptionsUtility.PUBLIC_READ_ROUTES.has(key) &&
      authenticate == null &&
      authorize == null;
    const endpoint: TRouteAuthConfig = isPublicRead
      ? { authenticate: { skip: true } }
      : { authenticate, authorize };

    // An entry-level `skip` is no default at all: nothing to inherit.
    const entryAuthenticate =
      auth?.authenticate == null || auth.authenticate.skip === true ? undefined : auth.authenticate;
    const entryAuthorize =
      auth?.authorize == null || (!Array.isArray(auth.authorize) && 'skip' in auth.authorize)
        ? undefined
        : auth.authorize;

    return {
      isEnabled: route?.isEnabled ?? true,
      override: {
        ...override,
        authenticate: RouteConfigResolver.resolveAuthenticate({
          controller: entryAuthenticate,
          endpoint: endpoint.authenticate,
        }),
        authorize: RouteConfigResolver.resolveAuthorize({
          controller: entryAuthorize,
          endpoint,
        }),
      },
    };
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
        maxFiles * (maxBytes + StaticAssetRouteOptionsUtility.ENVELOPE_BYTES_PER_FILE) +
        StaticAssetRouteOptionsUtility.ENVELOPE_BYTES_BASE,
    });

    if (!middleware) {
      return [guard, limit];
    }

    return Array.isArray(middleware) ? [...middleware, guard, limit] : [middleware, guard, limit];
  }
}
