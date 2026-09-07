import type { TAuthMode, TAuthStrategy } from '@/base/auth/authenticate/common/constants';
import type { IAuthorizationSpec } from '@/base/auth/authorize/common/types';
import type { TAnyObjectSchema } from '@/utilities/schema.utility';
import type { AnyType } from '@venizia/ignis-helpers/common';
import type { RouteConfig as HonoRouteConfig } from '@hono/zod-openapi';
import type { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { Env, Schema } from 'hono';
import type { TRouteHandler } from './context';

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

/** Per-route authentication config: { skip: true } or { strategies, mode }. */
export type TRouteAuthenticateConfig =
  { skip: true } | { skip?: false; strategies?: TAuthStrategy[]; mode?: TAuthMode };

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

// Response body types derived from route definitions; a distributive conditional applies z.infer to each schema of the union separately.
type TInferDistributive<S> = S extends z.ZodType ? z.infer<S> : never;
export type TResponseBodyOf<R extends { responses: AnyType }> = TInferDistributive<
  R['responses'][keyof R['responses']]['content']['application/json']['schema']
>;

export type TCustomizableRouteConfig = TRouteAuthConfig & {
  /** Whether this route is registered. Defaults to true. */
  enabled?: boolean;
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
