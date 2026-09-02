import type { ValueOrPromise } from '@venizia/ignis-helpers/common';
import type { Context, Env, TypedResponse } from 'hono';
import type { ContentfulStatusCode, StatusCode } from 'hono/utils/http-status';

/** Typed validation results for route handlers. */
export interface IValidRequestProps<
  JsonType = unknown,
  QueryType = unknown,
  ParamType = unknown,
  HeaderType = unknown,
  CookieType = unknown,
  FormType = unknown,
> {
  json?: JsonType;
  query?: QueryType;
  param?: ParamType;
  header?: HeaderType;
  cookie?: CookieType;
  form?: FormType;
}

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

export type TRouteContext<RouteEnv extends Env = Env, ResponseBody = unknown> = TContext<
  RouteEnv,
  keyof IValidRequestProps,
  ResponseBody
>;

/** Lightweight handler type using TTypedContext to avoid heavy RouteHandler inference. */
export type TRouteHandler<ResponseType = unknown, RouteEnv extends Env = Env> = (
  context: TRouteContext<RouteEnv, ResponseType>,
) => ValueOrPromise<Response | TypedResponse<ResponseType>>;
