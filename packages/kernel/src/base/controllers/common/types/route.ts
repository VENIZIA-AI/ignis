import type { TAuthMode, TAuthStrategy } from '@/base/auth/authenticate/common/constants';
import type { IAuthorizationSpec } from '@/base/auth/authorize/common/types';
import type { TAnyObjectSchema } from '@/base/controllers/common/schema-builders';
import type { OpenAPIHono, z } from '@hono/zod-openapi';
import type { HTTP, ValueOf } from '@venizia/ignis-helpers/common';
import type { Env, MiddlewareHandler, Schema } from 'hono';
import type { TRouteHandler } from './context';

/** Registered route with its configuration and router instance. */
export interface IDefineRouteOptions<
  RouteConfig extends IAuthRouteConfig,
  RouteEnv extends Env = Env,
  RouteSchema extends Schema = {},
  BasePath extends string = '/',
> {
  /** The config given, typed as given; at run time it also carries what the framework added to register the route. */
  configs: RouteConfig;
  route: OpenAPIHono<RouteEnv, RouteSchema, BasePath>;
}

/** Fluent binding for two-step route registration: bindRoute({ configs }).to({ handler }). */
export interface IBindRouteOptions<
  RouteConfig extends IAuthRouteConfig,
  RouteEnv extends Env = Env,
  RouteSchema extends Schema = {},
  BasePath extends string = '/',
> {
  configs: RouteConfig;
  to: <ResponseType = unknown>(opts: {
    handler: TRouteHandler<ResponseType, RouteEnv>;
  }) => IDefineRouteOptions<RouteConfig, RouteEnv, RouteSchema, BasePath>;
}

/** A zod schema, read by its `_zod` member and never compared structurally, or a raw OpenAPI object. */
type TRouteSchema = { _zod: unknown } | Record<string, unknown>;
/** A zod object schema of a request part. */
type TRequestPartSchema = { _zod: unknown };

/** One entry of a `content` map. */
type TRouteMediaType = {
  schema?: TRouteSchema;
  example?: unknown;
  examples?: unknown;
  encoding?: unknown;
  itemSchema?: unknown;
  itemEncoding?: unknown;
  prefixEncoding?: unknown;
  [extension: `x-${string}`]: unknown;
};

/** A response of a route, or a reference to one. */
type TRouteResponse =
  | {
      description?: string;
      summary?: string;
      headers?: object;
      links?: object;
      content?: Record<string, TRouteMediaType>;
      [extension: `x-${string}`]: unknown;
    }
  | { $ref: string };

/** The methods a route is registered under. */
type TRouteMethod = Exclude<ValueOf<typeof HTTP.Methods>, typeof HTTP.Methods.QUERY> | 'trace';

/**
 * A route of an IGNIS controller: the OpenAPI operation, its request and responses, and the framework's
 * `authenticate` and `authorize`. It is IGNIS's own type, not Hono's `RouteConfig`, so that checking a config never
 * compares zod types structurally; the framework converts it where it registers the route.
 */
export interface IAuthRouteConfig {
  method: TRouteMethod;
  path: string;
  summary?: string;
  description?: string;
  tags?: string[];
  operationId?: string;
  deprecated?: boolean;
  security?: Array<Record<string, string[]>>;
  /** Leaves the route out of the OpenAPI document. */
  hide?: boolean;
  externalDocs?: object;
  servers?: object[];
  parameters?: object[];
  callbacks?: object;
  middleware?: MiddlewareHandler | MiddlewareHandler[];
  request?: {
    params?: TRequestPartSchema;
    query?: TRequestPartSchema;
    cookies?: TRequestPartSchema;
    headers?: TRequestPartSchema | TRequestPartSchema[];
    body?: {
      content: Record<string, TRouteMediaType>;
      description?: string;
      required?: boolean;
      [extension: `x-${string}`]: unknown;
    };
  };
  responses: Record<string | number, TRouteResponse>;
  [extension: `x-${string}`]: unknown;
  authenticate?: { strategies?: TAuthStrategy[]; mode?: TAuthMode };
  authorize?: IAuthorizationSpec | IAuthorizationSpec[];
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

// Response body types derived from route definitions; a distributive conditional applies z.infer to each schema of the union separately.
type TInferDistributive<S> = S extends z.ZodType ? z.infer<S> : never;
type TJsonSchemaOf<Response> = Response extends {
  content: { 'application/json': { schema: infer JsonSchema } };
}
  ? JsonSchema
  : never;
/** The JSON response body type of a route config `R`: the union of the schemas under `application/json` across all its response codes. */
export type TResponseBodyOf<R extends { responses: object }> = TInferDistributive<
  TJsonSchemaOf<R['responses'][keyof R['responses']]>
>;

/** What a CRUD route lets a caller override: auth, the request schemas (params, query, body, headers) and the response schema and headers. */
export type TCustomizableRouteConfig = TRouteAuthConfig & {
  request?: {
    params?: TAnyObjectSchema;
    query?: TAnyObjectSchema;
    body?: TAnyObjectSchema;
    headers?: TAnyObjectSchema;
  };
  response?: {
    schema?: z.ZodType;
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
  restoreById?: RouteConfig;
  restoreBy?: RouteConfig;
}

/** The repository methods the restore routes call. */
type TRestorableMethods = { restoreById: unknown; restoreBy: unknown };

/**
 * The routes of a CRUD controller: only a listed route exists, as `true` (on, with its defaults) or a config
 * (on, with overrides). `restoreById` and `restoreBy` are listed only for a repository that has both methods.
 */
export type TCrudRoutes<Repository extends object = TRestorableMethods> = {
  [Key in keyof ICustomizableRoutes]?: Key extends keyof TRestorableMethods
    ? Repository extends TRestorableMethods
      ? true | TCustomizableRouteConfig
      : never
    : true | TCustomizableRouteConfig;
};
