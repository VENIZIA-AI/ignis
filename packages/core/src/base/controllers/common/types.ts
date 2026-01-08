import { TAuthMode, TAuthStrategy } from '@/components/auth/authenticate/common';
import { TAnyObjectSchema } from '@/utilities/schema.utility';
import type { RouteConfig as HonoRouteConfig } from '@hono/zod-openapi';
import { createRoute, Hook, OpenAPIHono, z } from '@hono/zod-openapi';
import { IConfigurable, ValueOrPromise } from '@venizia/ignis-helpers';
import type { TypedResponse } from 'hono';
import { Context, Env, Schema } from 'hono';

// -----------------------------------------------------------------------------
// Lightweight Context Types (bypasses RouteHandler inference)
// -----------------------------------------------------------------------------

/**
 * Typed validation results for route handlers.
 * Use with {@link TContext} to define handler parameter types without heavy inference.
 */
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

/**
 * Lightweight typed context that bypasses RouteHandler inference.
 *
 * Use `valid<T>('target')` for explicit typing of validated request data.
 *
 * @typeParam RouteEnv - Hono environment type
 *
 * @example
 * ```typescript
 * async createUser(opts: { context: TTypedContext }) {
 *   const body = opts.context.req.valid<{ name: string; email: string }>('json');
 *   const query = opts.context.req.valid<{ dryRun?: boolean }>('query');
 * }
 * ```
 */

export type TContext<RouteEnv extends Env = Env, ValidTargetKey extends string = string> = Omit<
  Context<RouteEnv>,
  'req'
> & {
  req: Omit<Context<RouteEnv>['req'], 'valid'> & {
    valid<T = unknown>(target: ValidTargetKey): T;
  };
};

export type TRouteContext<RouteEnv extends Env = Env> = TContext<
  RouteEnv,
  keyof IValidRequestProps
>;

/**
 * Type assertion function to cast middleware context to TContext.
 * Safe at runtime because TContext is structurally identical to Context.
 */
export const asTypedContext = <E extends Env>(context: unknown): TContext<E, string> => {
  return context as TContext<E, string>;
};

/**
 * Lightweight handler type for route handlers.
 * Uses TTypedContext to avoid heavy RouteHandler inference.
 */
export type TRouteHandler<ResponseType = unknown, RouteEnv extends Env = Env> = (
  context: TRouteContext<RouteEnv>,
) => ValueOrPromise<Response | TypedResponse<ResponseType>>;

/**
 * Represents a registered route with its configuration and router instance.
 *
 * Returned by {@link IController.bindRoute} and {@link IController.defineRoute}
 * after a route is registered with the router.
 *
 * @typeParam RouteConfig - The route configuration type
 * @typeParam RouteEnv - Hono environment type
 * @typeParam RouteSchema - Combined schema type for all routes
 * @typeParam BasePath - Base path prefix for the router
 */
export interface IDefineRouteOptions<
  RouteConfig extends HonoRouteConfig,
  RouteEnv extends Env = Env,
  RouteSchema extends Schema = {},
  BasePath extends string = '/',
> {
  configs: ReturnType<typeof createRoute<string, RouteConfig>>;
  route: OpenAPIHono<RouteEnv, RouteSchema, BasePath>;
}

/**
 * Fluent binding options for registering a route handler.
 *
 * Enables a two-step binding pattern:
 * ```typescript
 * controller.bindRoute({ configs }).to({ handler });
 * ```
 *
 * @typeParam RouteConfig - The route configuration type
 * @typeParam RouteEnv - Hono environment type
 * @typeParam RouteSchema - Combined schema type
 * @typeParam BasePath - Base path prefix
 */
export interface IBindRouteOptions<
  RouteConfig extends HonoRouteConfig,
  RouteEnv extends Env = Env,
  RouteSchema extends Schema = {},
  BasePath extends string = '/',
> {
  configs: RouteConfig;
  to: <ReponseType = unknown>(opts: {
    handler: TRouteHandler<ReponseType, RouteEnv>;
  }) => IDefineRouteOptions<RouteConfig, RouteEnv, RouteSchema, BasePath>;
}

/**
 * Route configuration extended with authentication strategies.
 *
 * Adds optional `authenticate` array to standard route config for
 * declarative authentication configuration.
 * ```
 */
export interface IAuthenticateRouteConfig extends HonoRouteConfig {
  authenticate?: { strategies?: TAuthStrategy[]; mode?: TAuthMode };
}

// -----------------------------------------------------------------------------
// Controller Interface
// -----------------------------------------------------------------------------

/**
 * Base controller interface defining the contract for all controllers.
 *
 * Controllers are responsible for:
 * - Defining HTTP routes and their handlers
 * - Validating request/response schemas via OpenAPI
 * - Applying authentication middleware
 * - Returning the configured router for mounting
 *
 * @typeParam RouteEnv - Hono environment for context variables (e.g., user, db)
 * @typeParam RouteSchema - Combined schema type for all routes
 * @typeParam BasePath - Base path prefix for the router
 * @typeParam ConfigurableOptions - Options passed during controller configuration
 *
 * @example
 * ```typescript
 * class UserController extends BaseController implements IController {
 *   binding() {
 *     this.defineRoute({
 *       configs: { path: '/', method: 'get', ... },
 *       handler: (c) => c.json({ users: [] })
 *     });
 *   }
 * }
 * ```
 */
export interface IController<
  RouteEnv extends Env = Env,
  RouteSchema extends Schema = {},
  BasePath extends string = '/',
  ConfigurableOptions extends object = {},
> extends IConfigurable<ConfigurableOptions, OpenAPIHono<RouteEnv, RouteSchema, BasePath>> {
  /** The OpenAPIHono router instance for this controller */
  router: OpenAPIHono<RouteEnv, RouteSchema, BasePath>;

  /**
   * Creates a fluent binding for registering a route.
   *
   * Use this when you need a two-step binding pattern or want to
   * conditionally bind handlers.
   *
   * @param opts - Object containing route configuration
   * @returns Binding options with a `to()` method for attaching the handler
   */
  bindRoute<RouteConfig extends IAuthenticateRouteConfig>(opts: {
    configs: RouteConfig;
  }): IBindRouteOptions<RouteConfig, RouteEnv, RouteSchema, BasePath>;

  /**
   * Defines and registers a route with its handler in a single call.
   *
   * Preferred method for most use cases. Applies authentication middleware
   * automatically based on `authenticate.strategies` in the config.
   *
   * @param opts - Object containing route config, handler, and optional hook
   * @returns The registered route definition
   */
  defineRoute<RouteConfig extends IAuthenticateRouteConfig, ResponseType = unknown>(opts: {
    configs: RouteConfig;
    handler: TRouteHandler<ResponseType, RouteEnv>;
    hook?: Hook<any, RouteEnv, string, ValueOrPromise<any>>;
  }): IDefineRouteOptions<RouteConfig, RouteEnv, RouteSchema, BasePath>;
}

// -----------------------------------------------------------------------------

/**
 * Configuration options for controller instantiation.
 */
export interface IControllerOptions {
  /** Logger scope identifier, typically the controller class name */
  scope: string;

  /**
   * Controller base path for all routes.
   *
   * If not provided, will be read from `@controller` decorator metadata.
   * At least one of decorator path or constructor path must be provided.
   *
   * @example '/users' or '/api/products'
   */
  path?: string;

  /**
   * Whether to use strict path matching.
   *
   * When `true` (default), `/users` and `/users/` are different routes.
   * When `false`, trailing slashes are ignored.
   *
   * @default true
   */
  isStrict?: boolean;
}

// -----------------------------------------------------------------------------
// Route Auth Config (for route customization)
// -----------------------------------------------------------------------------

/**
 * Per-route authentication configuration.
 *
 * Priority (endpoint config takes precedence over controller):
 * 1. If endpoint has `skipAuth: true` -> no auth
 * 2. If endpoint has `authenticate.strategies` -> use these (overrides controller)
 * 3. Otherwise -> use controller-level authenticate.strategies
 */
export type TRouteAuthConfig =
  | { skipAuth: true; authenticate?: never }
  | {
      skipAuth?: false;
      authenticate?: { strategies?: TAuthStrategy[]; mode?: TAuthMode };
    };

// -----------------------------------------------------------------------------
// Common Config Types
// -----------------------------------------------------------------------------

/** OpenAPI response header object */
export type TResponseHeaderObject = {
  description?: string;
  schema: { type: 'string'; examples?: string[] };
};

/** OpenAPI response headers format */
export type TResponseHeaders = Record<string, TResponseHeaderObject>;

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

/**
 * Per-route configuration for CRUD controller endpoints.
 *
 * Each route supports full customization of:
 * - Authentication (skipAuth, authenticate)
 * - Request (query, params, body, headers)
 * - Response (schema, headers)
 *
 */
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
