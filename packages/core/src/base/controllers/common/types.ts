import { TAuthMode, TAuthStrategy } from '@/components/auth/authenticate/common/constants';
import type { IAuthorizationSpec } from '@/components/auth/authorize/common/types';
import { TAnyObjectSchema } from '@/utilities/schema.utility';
import type { RouteConfig as HonoRouteConfig } from '@hono/zod-openapi';
import { createRoute, Hook, OpenAPIHono, z } from '@hono/zod-openapi';
import { AnyType, IConfigurable, ValueOrPromise } from '@venizia/ignis-helpers';
import type { TypedResponse } from 'hono';
import { Context, Env, Schema } from 'hono';
import { ContentfulStatusCode, StatusCode } from 'hono/utils/http-status';

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

/**
 * Polymorphic response body for endpoints that honor the `x-request-count-data`
 * header — returns either the count-wrapped shape `{ count, data }` or the raw
 * payload `T`. Pass the unwrapped payload type as `T`; for arrays use
 * `TCountResponse<TThing[]>`.
 */
export type TCountResponse<TData = unknown> = TData | { count: number; data: TData };

/** Lightweight typed context that bypasses RouteHandler inference. */
export type TContext<
  RouteEnv extends Env = Env,
  ValidTargetKey extends string = string,
  ResponseBody = unknown,
> = Omit<Context<RouteEnv>, 'req' | 'json'> & {
  req: Omit<Context<RouteEnv>['req'], 'valid'> & { valid<T = unknown>(target: ValidTargetKey): T };
  json<StatusCode extends ContentfulStatusCode = 200>(
    body: ResponseBody,
    status?: StatusCode,
  ): TJsonResponse<ResponseBody, StatusCode>;
};

export type TRouteContext<RouteEnv extends Env = Env, ResponseBody = unknown> = TContext<
  RouteEnv,
  keyof IValidRequestProps,
  ResponseBody
>;

/** Casts middleware context to TContext (safe -- structurally identical to Context). */
export const asTypedContext = <E extends Env>(context: unknown): TContext<E, string> => {
  return context as TContext<E, string>;
};

/** Lightweight handler type using TTypedContext to avoid heavy RouteHandler inference. */
export type TRouteHandler<ResponseType = unknown, RouteEnv extends Env = Env> = (
  context: TRouteContext<RouteEnv, ResponseType>,
) => ValueOrPromise<Response | TypedResponse<ResponseType>>;

/** Registered route with its configuration and router instance. */
export interface IDefineRouteOptions<
  RouteConfig extends HonoRouteConfig,
  RouteEnv extends Env = Env,
  RouteSchema extends Schema = {},
  BasePath extends string = '/',
> {
  configs: ReturnType<typeof createRoute<string, RouteConfig>>;
  route: OpenAPIHono<RouteEnv, RouteSchema, BasePath>;
}

/** Fluent binding for two-step route registration: bindRoute({ configs }).to({ handler }). */
export interface IBindRouteOptions<
  RouteConfig extends HonoRouteConfig,
  RouteEnv extends Env = Env,
  RouteSchema extends Schema = {},
  BasePath extends string = '/',
> {
  configs: RouteConfig;
  to: <ResponseType = unknown>(opts: {
    handler: TRouteHandler<ResponseType, RouteEnv>;
  }) => IDefineRouteOptions<RouteConfig, RouteEnv, RouteSchema, BasePath>;
}

/** Route configuration extended with optional authenticate and authorize fields. */
export interface IAuthRouteConfig extends HonoRouteConfig {
  authenticate?: { strategies?: TAuthStrategy[]; mode?: TAuthMode };
  authorize?: IAuthorizationSpec | IAuthorizationSpec[];
}

/** Base controller interface defining route registration and configuration contract. */
export interface IController<
  RouteEnv extends Env = Env,
  RouteSchema extends Schema = {},
  BasePath extends string = '/',
  ConfigurableOptions extends object = {},
> extends IConfigurable<ConfigurableOptions, OpenAPIHono<RouteEnv, RouteSchema, BasePath>> {
  router: OpenAPIHono<RouteEnv, RouteSchema, BasePath>;

  bindRoute<RouteConfig extends IAuthRouteConfig>(opts: {
    configs: RouteConfig;
  }): IBindRouteOptions<RouteConfig, RouteEnv, RouteSchema, BasePath>;

  /** Defines and registers a route with its handler in a single call. */
  defineRoute<RouteConfig extends IAuthRouteConfig, ResponseType = unknown>(opts: {
    configs: RouteConfig;
    handler: TRouteHandler<ResponseType, RouteEnv>;
    hook?: Hook<any, RouteEnv, string, ValueOrPromise<any>>;
  }): IDefineRouteOptions<RouteConfig, RouteEnv, RouteSchema, BasePath>;
}

/** Configuration options for controller instantiation. */
export interface IControllerOptions {
  scope: string;
  /** Falls back to @controller decorator path if not provided. */
  path?: string;
  /** When true (default), /users and /users/ are different routes. */
  isStrict?: boolean;
}

/** Per-route authentication config: { skip: true } or { strategies, mode }. */
export type TRouteAuthenticateConfig =
  | { skip: true }
  | { skip?: false; strategies?: TAuthStrategy[]; mode?: TAuthMode };

/** Per-route authorization config: { skip: true }, single spec, or array of specs. */
export type TRouteAuthorizeConfig = { skip: true } | IAuthorizationSpec | IAuthorizationSpec[];

/** Per-route auth config. Endpoint config takes precedence over controller-level config. */
export type TRouteAuthConfig = {
  authenticate?: TRouteAuthenticateConfig;
  authorize?: TRouteAuthorizeConfig;
};

/** OpenAPI response header object */
export type TResponseHeaderObject = {
  description?: string;
  schema: { type: 'string'; examples?: string[] };
};

/** OpenAPI response headers format */
export type TResponseHeaders = Record<string, TResponseHeaderObject>;

// Response body types — derived from route definitions (union of success + error schemas).
// Uses a distributive conditional so z.infer is applied to each schema in the union separately.
type TInferDistributive<S> = S extends z.ZodType ? z.infer<S> : never;
export type TResponseBodyOf<R extends { responses: AnyType }> = TInferDistributive<
  R['responses'][keyof R['responses']]['content']['application/json']['schema']
>;

export type TCustomizableRouteConfig = TRouteAuthConfig & {
  request?: {
    params?: TAnyObjectSchema;
    query?: TAnyObjectSchema;
    body?: TAnyObjectSchema;
    headers?: TAnyObjectSchema;
  };
  response?: {
    schema?: z.ZodTypeAny;
    headers?: TResponseHeaders;
  };
};

/** Per-route configuration for CRUD controller endpoints (auth, request, response). */
export interface ICustomizableRoutes<
  RouteConfig extends TCustomizableRouteConfig = TCustomizableRouteConfig,
> {
  count?: RouteConfig;
  find?: RouteConfig;
  findById?: RouteConfig;
  findOne?: RouteConfig;
  create?: RouteConfig;
  updateById?: RouteConfig;
  updateBy?: RouteConfig;
  deleteById?: RouteConfig;
  deleteBy?: RouteConfig;
}
