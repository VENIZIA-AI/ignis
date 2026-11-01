import { HTTP } from '@venizia/ignis-helpers/common';
import type { ValueOrPromise } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';
import { ScopeFilters } from '@venizia/ignis-kernel';
import type { TRouteContext, TWhere } from '@venizia/ignis-kernel';
import type { Env } from 'hono';
import type { TSearchInput } from '@/search/core/repositories/common';
import { SearchModes } from '@/search/core/repositories/common';

/**
 * A per-request search scope: the filter the caller is allowed to search within (a merchant, a
 * sharing rule). Return a `where`, `ScopeFilters.UNRESTRICTED` to apply none for this call, or
 * null/undefined when the caller's scope is unknown - which refuses the request.
 */
export type TSearchScopeResolver<RouteEnv extends Env = Env> = (opts: {
  context: TRouteContext<RouteEnv>;
}) => ValueOrPromise<TWhere | typeof ScopeFilters.UNRESTRICTED | null | undefined>;

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
   * - `raw` mode and `engineParams` hand the engine its own wire parameters (`filter_by` among them),
   *   which a `where` cannot be ANDed into, so a scoped controller refuses them (400).
   */
  static async applySearchScope<RouteEnv extends Env = Env>(opts: {
    resolve: TSearchScopeResolver<RouteEnv>;
    context: TRouteContext<RouteEnv>;
    input: TSearchInput;
  }): Promise<TSearchInput> {
    const { resolve, context, input } = opts;

    let scope: Awaited<ReturnType<TSearchScopeResolver<RouteEnv>>>;
    try {
      const result = await resolve({ context });
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

    if (input.engineParams !== undefined) {
      throw SearchControllerScope.refuse({
        statusCode: HTTP.ResultCodes.RS_4.BadRequest,
        message: '[search] engineParams is not available on a scoped search controller',
      });
    }

    const clientWhere = input.filter?.where;

    return {
      ...input,
      filter: {
        ...input.filter,
        where: clientWhere ? { and: [scope, clientWhere] } : scope,
      },
    } as TSearchInput;
  }
}
