import type { ValueOrPromise } from '@venizia/ignis-helpers/common';
import type { Context, Env, TypedResponse } from 'hono';
import type { ContentfulStatusCode, StatusCode } from 'hono/utils/http-status';
import type { IRouteContext } from './context.internal';
import type { IAuthRouteConfig } from './route';

/** A Hono JSON `Response` typed with its body and status code. */
export type TJsonResponse<
  ResponseBody = unknown,
  ResponseStatusCode extends StatusCode = StatusCode,
> = Response & TypedResponse<ResponseBody, ResponseStatusCode, 'json'>;

/** Polymorphic response body for endpoints honoring the `x-request-count-data` header - the count-wrapped `{ count, data }` or the raw payload; pass the unwrapped payload type as `T`. */
export type TCountResponse<TData = unknown> = TData | { count: number; data: TData };

/** Lightweight typed context that bypasses RouteHandler inference. */
export type TContext<
  RouteEnv extends Env = Env,
  ValidTargetKey extends string = string,
  ResponseBody = unknown,
> = Omit<Context<RouteEnv>, 'req' | 'json'> & {
  req: Omit<Context<RouteEnv>['req'], 'valid'> & { valid<T = unknown>(target: ValidTargetKey): T };
  json<TStatusCode extends ContentfulStatusCode = 200>(
    body: ResponseBody,
    status?: TStatusCode,
  ): TJsonResponse<ResponseBody, TStatusCode>;
};

/**
 * The context of a handler of the route `RouteConfig`: `req.valid(target)` is typed from the config's request schemas,
 * and is `unknown` for a part the config does not declare. Write it where TypeScript cannot read the config itself,
 * as on a decorated method: `context: TContextOf<typeof Routes.CREATE>`.
 */
export type TContextOf<RouteConfig extends object, RouteEnv extends Env = Env> = IRouteContext<
  RouteConfig,
  RouteEnv
>;

/** The context of a route whose config is not named: `req.valid()` answers the type you give it, else `unknown`. */
export type TRouteContext<RouteEnv extends Env = Env> = TContextOf<IAuthRouteConfig, RouteEnv>;

/** A handler of a route whose config is not named. */
export type TRouteHandler<RouteEnv extends Env = Env> = (
  context: TRouteContext<RouteEnv>,
) => ValueOrPromise<Response | TypedResponse<unknown>>;
