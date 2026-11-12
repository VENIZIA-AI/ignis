import { BodyLimits, RouteConfigResolver } from '@venizia/ignis-kernel';
import type { IAuthRouteConfig, TRouteAuthConfig } from '@/base';
import {
  StaticAssetRouteKeys,
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
    StaticAssetRouteKeys.GET_OBJECT_BY_NAME,
    StaticAssetRouteKeys.DOWNLOAD_OBJECT_BY_NAME,
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
   * The route's body validator reads the whole multipart body, so a limit checked in the handler arrives
   * too late to save any memory. Appended after the application's own middleware, so a check of its own
   * still answers first.
   *
   * The limit is `maxFiles` files of `maxBytes` each, plus their multipart framing. A chunked body, which
   * has no declared length, is counted too. The per-file check in the handler still decides each file.
   */
  static appendBodyLimit(opts: {
    middleware: TStaticAssetRouteConfig['middleware'];
    maxBytes: number;
    maxFiles: number;
  }): NonNullable<TStaticAssetRouteConfig['middleware']> {
    const { middleware, maxBytes, maxFiles } = opts;

    const limit = BodyLimits.route({
      maxSize:
        maxFiles * (maxBytes + StaticAssetRouteOptionsUtility.ENVELOPE_BYTES_PER_FILE) +
        StaticAssetRouteOptionsUtility.ENVELOPE_BYTES_BASE,
    });

    if (!middleware) {
      return [limit];
    }

    return Array.isArray(middleware) ? [...middleware, limit] : [middleware, limit];
  }
}
