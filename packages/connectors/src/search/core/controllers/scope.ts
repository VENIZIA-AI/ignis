import { HTTP } from '@venizia/ignis-helpers/common';
import type { ValueOrPromise } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';
import { ScopeFilters } from '@venizia/ignis-kernel';
import type { TInjected, TInjectMap, TRouteContext, TWhere } from '@venizia/ignis-kernel';
import type { Env } from 'hono';
import type { TSearchInput } from '@/search/core/repositories/common';
import { SearchModes } from '@/search/core/repositories/common';
import type { TNullable } from '@venizia/ignis-helpers/common';

/**
 * A per-request search scope: the filter the caller is allowed to search within (a merchant, a
 * sharing rule). Return a `where`, `ScopeFilters.UNRESTRICTED` to apply none for this call, or
 * null/undefined when the caller's scope is unknown - which refuses the request.
 */
export type TSearchScopeResolver<
  RouteEnv extends Env = Env,
  TExtra extends object = {},
  Inject extends TInjectMap = {},
> = (opts: {
  context: TRouteContext<RouteEnv>;
  /** The validated request body: the search input, and the keys the controller's `request.body.extend` adds. */
  input: TSearchInput & TExtra;
  /** The instances of the classes `inject` declares. */
  injected: TInjected<Inject>;
}) => ValueOrPromise<TNullable<TWhere | typeof ScopeFilters.UNRESTRICTED>>;

export class SearchControllerScope {
  private static refuse(opts: { statusCode: number; message: string; cause?: unknown }) {
    return getError({
      statusCode: opts.statusCode,
      message: opts.message,
      cause: opts.cause,
    });
  }

  /**
   * ANDs the resolved scope into `input.filter.where`, on the server, after the body was validated.
   * The client's own `where` is kept inside the AND, so it can narrow the scope and never widen it.
   *
   * Fails closed:
   * - a scope that is null, undefined, or throws refuses the request (403);
   * - `raw` mode hands the engine its own wire parameters (`filter_by` among them), which a `where` cannot be
   *   ANDed into, so a scoped controller refuses it (400). `engineParams` is checked before this, on every controller
   *   (`SearchEngineParams`): what a controller allows there never selects rows or fields.
   */
  static async applySearchScope<
    RouteEnv extends Env = Env,
    TExtra extends object = {},
    Inject extends TInjectMap = {},
  >(opts: {
    resolve: TSearchScopeResolver<RouteEnv, TExtra, Inject>;
    context: TRouteContext<RouteEnv>;
    input: TSearchInput & TExtra;
    injected: TInjected<Inject>;
  }): Promise<TSearchInput & TExtra> {
    const { resolve, context, input, injected } = opts;

    let scope: Awaited<ReturnType<TSearchScopeResolver<RouteEnv, TExtra, Inject>>>;

    try {
      const result = await resolve({ context, input, injected });
      scope = result;
    } catch (error) {
      throw SearchControllerScope.refuse({
        statusCode: HTTP.ResultCodes.RS_4.Forbidden,
        message: '[search] the search scope could not be resolved for this request',
        cause: error,
      });
    }

    if (scope === ScopeFilters.UNRESTRICTED) {
      return input;
    }

    if (scope === null || scope === undefined) {
      throw SearchControllerScope.refuse({
        statusCode: HTTP.ResultCodes.RS_4.Forbidden,
        message: '[search] no search scope for this request',
      });
    }

    if (input.mode === SearchModes.RAW) {
      throw SearchControllerScope.refuse({
        statusCode: HTTP.ResultCodes.RS_4.BadRequest,
        message: "[search] mode 'raw' is not available on a scoped search controller",
      });
    }

    const clientWhere = input.filter?.where;

    return {
      ...input,
      filter: {
        ...input.filter,
        where: clientWhere ? { and: [scope, clientWhere] } : scope,
      },
    };
  }
}
