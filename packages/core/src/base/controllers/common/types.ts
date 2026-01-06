import { TAuthMode, TAuthStrategy } from '@/components/auth/authenticate/common';
import { TAnyObjectSchema } from '@/utilities/schema.utility';
import type { RouteConfig, RouteHandler } from '@hono/zod-openapi';
import { createRoute, Hook, OpenAPIHono, z } from '@hono/zod-openapi';
import { IConfigurable, ValueOrPromise } from '@venizia/ignis-helpers';
import { Env, Schema } from 'hono';

/**
 * Lazy-evaluated route handler type that preserves type inference from route config.
 *
 * Uses conditional type distribution to ensure proper type narrowing for the
 * route handler based on the route configuration.
 *
 * @typeParam RC - The route configuration type
 * @typeParam RouteEnv - Hono environment type for context variables
 */
export type TLazyRouteHandler<RC extends RouteConfig, RouteEnv extends Env = Env> = RC extends RC
  ? RouteHandler<RC, RouteEnv>
  : never;

/**
 * Represents a registered route with its configuration and router instance.
 *
 * Returned by {@link IController.bindRoute} and {@link IController.defineRoute}
 * after a route is registered with the router.
 *
 * @typeParam RC - The route configuration type
 * @typeParam RouteEnv - Hono environment type
 * @typeParam RouteSchema - Combined schema type for all routes
 * @typeParam BasePath - Base path prefix for the router
 */
export type TRouteDefinition<
  RC extends RouteConfig,
  RouteEnv extends Env = Env,
  RouteSchema extends Schema = {},
  BasePath extends string = '/',
> = {
  configs: ReturnType<typeof createRoute<string, RC>>;
  route: OpenAPIHono<RouteEnv, RouteSchema, BasePath>;
};

/**
 * Fluent binding options for registering a route handler.
 *
 * Enables a two-step binding pattern:
 * ```typescript
 * controller.bindRoute({ configs }).to({ handler });
 * ```
 *
 * @typeParam RC - The route configuration type
 * @typeParam RouteEnv - Hono environment type
 * @typeParam RouteSchema - Combined schema type
 * @typeParam BasePath - Base path prefix
 */
export type TRouteBindingOptions<
  RC extends RouteConfig,
  RouteEnv extends Env = Env,
  RouteSchema extends Schema = {},
  BasePath extends string = '/',
> = {
  configs: RC;
  to: (opts: {
    handler: TLazyRouteHandler<RC, RouteEnv>;
  }) => TRouteDefinition<RC, RouteEnv, RouteSchema, BasePath>;
};

/**
 * Route configuration extended with authentication strategies.
 *
 * Adds optional `authStrategies` array to standard route config for
 * declarative authentication configuration.
 *
 * @typeParam RC - The base route configuration type
 *
 * @example
 * ```typescript
 * const config: TAuthRouteConfig<RouteConfig> = {
 *   path: '/protected',
 *   method: 'get',
 *   authStrategies: ['jwt', 'basic'],
 *   authMode: 'any', // 'any' = fallback (default), 'all' = all must pass
 *   responses: { 200: { ... } }
 * };
 * ```
 */
export type TAuthRouteConfig<RC extends RouteConfig> = RC & {
  authStrategies?: readonly TAuthStrategy[];
  authMode?: TAuthMode;
};

/**
 * Extract the context type from a route config for use in decorated handler methods
 *
 * @example
 * ```typescript
 * const config = {
 *   path: '/test',
 *   method: 'post',
 *   request: { body: jsonContent({ schema: z.object({ name: z.string() }) }) },
 *   responses: { 200: jsonContent({ schema: z.object({ id: z.string() }) }) }
 * } as const;
 *
 * class MyController extends BaseController {
 *   @post({ configs: config })
 *   myMethod(context: TRouteContext<typeof config>): TRouteResponse<typeof config> {
 *     const body = context.req.valid('json'); // typed as { name: string }
 *     return context.json({ id: '123' }, 200); // validated against response schema
 *   }
 * }
 * ```
 */
export type TRouteContext<
  RC extends TAuthRouteConfig<RouteConfig>,
  RouteEnv extends Env = Env,
> = Parameters<TLazyRouteHandler<RC, RouteEnv>>[0];

/**
 * Extract the return type from a route config for use in decorated handler methods.
 *
 * **Note:** This type is optional for decorated methods, as TypeScript can automatically
 * infer and validate the return type from the route configuration. It can be useful for
 * explicit clarity or in complex scenarios.
 *
 * @example
 * ```typescript
 * const config = {
 *   path: '/test',
 *   method: 'get',
 *   responses: { 200: jsonContent({ schema: z.object({ message: z.string() }) }) }
 * } as const;
 *
 * class MyController extends BaseController {
 *   @get({ configs: config })
 *   myMethod(context: TRouteContext<typeof config>) { // TRouteResponse is optional here
 *     // Return type is validated - must return Response or TypedResponse matching the schema
 *     return context.json({ message: 'hello' }, 200);
 *   }
 * }
 * ```
 */
export type TRouteResponse<
  RC extends TAuthRouteConfig<RouteConfig>,
  RouteEnv extends Env = Env,
> = ReturnType<TLazyRouteHandler<RC, RouteEnv>>;

// -----------------------------------------------------------------------------
// CRUD Route Definition Types
// -----------------------------------------------------------------------------

/**
 * Extracts the context type for a specific route from a definitions object.
 * Use this to properly type overridden CRUD methods.
 *
 * @typeParam D - The definitions object type
 * @typeParam K - The route key (e.g., 'CREATE', 'FIND')
 * @typeParam RouteEnv - Hono environment type
 *
 * @example
 * ```typescript
 * const _Controller = ControllerFactory.defineCrudController({
 *   entity: () => MyEntity,
 *   repository: { name: 'MyRepository' },
 *   controller: { name: 'MyController', basePath: '/my-path' },
 * });
 *
 * // Extract definitions type from the generated controller
 * type TRouteDefinitions = InstanceType<typeof _Controller>['definitions'];
 *
 * class MyController extends _Controller {
 *   override async create(opts: { context: THandlerContext<TRouteDefinitions, 'CREATE'> }) {
 *     const { context } = opts;
 *     const data = context.req.valid('json'); // Properly typed!
 *     // Custom logic here...
 *     return super.create(opts);
 *   }
 * }
 * ```
 */
export type THandlerContext<
  RouteDefinition extends Record<string, TAuthRouteConfig<RouteConfig>>,
  Key extends keyof RouteDefinition,
  RouteEnv extends Env = Env,
> = TRouteContext<RouteDefinition[Key], RouteEnv>;

/**
 * Extracts the return type for a specific route from a definitions object.
 *
 * @typeParam D - The definitions object type
 * @typeParam K - The route key
 * @typeParam RouteEnv - Hono environment type
 */
export type THandlerResponse<
  RouteDefinition extends Record<string, TAuthRouteConfig<RouteConfig>>,
  Key extends keyof RouteDefinition,
  RouteEnv extends Env = Env,
> = TRouteResponse<RouteDefinition[Key], RouteEnv>;

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
  bindRoute<RC extends TAuthRouteConfig<RouteConfig>>(opts: {
    configs: RC;
  }): TRouteBindingOptions<RC, RouteEnv, RouteSchema, BasePath>;

  /**
   * Defines and registers a route with its handler in a single call.
   *
   * Preferred method for most use cases. Applies authentication middleware
   * automatically based on `authStrategies` in the config.
   *
   * @param opts - Object containing route config, handler, and optional hook
   * @returns The registered route definition
   */
  defineRoute<RC extends TAuthRouteConfig<RouteConfig>>(opts: {
    configs: RC;
    handler: TLazyRouteHandler<RC, RouteEnv>;
    hook?: Hook<any, RouteEnv, string, ValueOrPromise<any>>;
  }): TRouteDefinition<RC, RouteEnv, RouteSchema, BasePath>;
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
 * 2. If endpoint has `authStrategies` -> use these (overrides controller)
 * 3. Otherwise -> use controller-level authStrategies
 */
export type TRouteAuthConfig =
  | { skipAuth: true; authStrategies?: never }
  | { skipAuth?: false; authStrategies?: Array<TAuthStrategy> };

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

// -----------------------------------------------------------------------------
// COUNT Route Config
// -----------------------------------------------------------------------------

/** Request configuration for COUNT route */
export type TCountRequestConfig = {
  query?: TAnyObjectSchema;
  headers?: TAnyObjectSchema;
};

/** Response configuration for COUNT route */
export type TCountResponseConfig = {
  schema?: z.ZodTypeAny;
  headers?: TResponseHeaders;
};

/** Full configuration for COUNT route */
export type TCountRouteConfig = TRouteAuthConfig & {
  request?: TCountRequestConfig;
  response?: TCountResponseConfig;
};

// -----------------------------------------------------------------------------
// FIND Route Config
// -----------------------------------------------------------------------------

/** Request configuration for FIND route */
export type TFindRequestConfig = {
  query?: TAnyObjectSchema;
  headers?: TAnyObjectSchema;
};

/** Response configuration for FIND route */
export type TFindResponseConfig = {
  schema?: z.ZodTypeAny;
  headers?: TResponseHeaders;
};

/** Full configuration for FIND route */
export type TFindRouteConfig = TRouteAuthConfig & {
  request?: TFindRequestConfig;
  response?: TFindResponseConfig;
};

// -----------------------------------------------------------------------------
// FIND_BY_ID Route Config
// -----------------------------------------------------------------------------

/** Request configuration for FIND_BY_ID route */
export type TFindByIdRequestConfig = {
  /** Note: params cannot be customized - id param is required */
  query?: TAnyObjectSchema;
  headers?: TAnyObjectSchema;
};

/** Response configuration for FIND_BY_ID route */
export type TFindByIdResponseConfig = {
  schema?: z.ZodTypeAny;
  headers?: TResponseHeaders;
};

/** Full configuration for FIND_BY_ID route */
export type TFindByIdRouteConfig = TRouteAuthConfig & {
  request?: TFindByIdRequestConfig;
  response?: TFindByIdResponseConfig;
};

// -----------------------------------------------------------------------------
// FIND_ONE Route Config
// -----------------------------------------------------------------------------

/** Request configuration for FIND_ONE route */
export type TFindOneRequestConfig = {
  query?: TAnyObjectSchema;
  headers?: TAnyObjectSchema;
};

/** Response configuration for FIND_ONE route */
export type TFindOneResponseConfig = {
  schema?: z.ZodTypeAny;
  headers?: TResponseHeaders;
};

/** Full configuration for FIND_ONE route */
export type TFindOneRouteConfig = TRouteAuthConfig & {
  request?: TFindOneRequestConfig;
  response?: TFindOneResponseConfig;
};

// -----------------------------------------------------------------------------
// CREATE Route Config
// -----------------------------------------------------------------------------

/** Request configuration for CREATE route */
export type TCreateRequestConfig = {
  body?: TAnyObjectSchema;
  headers?: TAnyObjectSchema;
};

/** Response configuration for CREATE route */
export type TCreateResponseConfig = {
  schema?: z.ZodTypeAny;
  headers?: TResponseHeaders;
};

/** Full configuration for CREATE route */
export type TCreateRouteConfig = TRouteAuthConfig & {
  request?: TCreateRequestConfig;
  response?: TCreateResponseConfig;
};

// -----------------------------------------------------------------------------
// UPDATE_BY_ID Route Config
// -----------------------------------------------------------------------------

/** Request configuration for UPDATE_BY_ID route */
export type TUpdateByIdRequestConfig = {
  /** Note: params cannot be customized - id param is required */
  body?: TAnyObjectSchema;
  headers?: TAnyObjectSchema;
};

/** Response configuration for UPDATE_BY_ID route */
export type TUpdateByIdResponseConfig = {
  schema?: z.ZodTypeAny;
  headers?: TResponseHeaders;
};

/** Full configuration for UPDATE_BY_ID route */
export type TUpdateByIdRouteConfig = TRouteAuthConfig & {
  request?: TUpdateByIdRequestConfig;
  response?: TUpdateByIdResponseConfig;
};

// -----------------------------------------------------------------------------
// UPDATE_BY Route Config
// -----------------------------------------------------------------------------

/** Request configuration for UPDATE_BY route */
export type TUpdateByRequestConfig = {
  query?: TAnyObjectSchema;
  body?: TAnyObjectSchema;
  headers?: TAnyObjectSchema;
};

/** Response configuration for UPDATE_BY route */
export type TUpdateByResponseConfig = {
  schema?: z.ZodTypeAny;
  headers?: TResponseHeaders;
};

/** Full configuration for UPDATE_BY route */
export type TUpdateByRouteConfig = TRouteAuthConfig & {
  request?: TUpdateByRequestConfig;
  response?: TUpdateByResponseConfig;
};

// -----------------------------------------------------------------------------
// DELETE_BY_ID Route Config
// -----------------------------------------------------------------------------

/** Request configuration for DELETE_BY_ID route */
export type TDeleteByIdRequestConfig = {
  /** Note: params cannot be customized - id param is required */
  headers?: TAnyObjectSchema;
};

/** Response configuration for DELETE_BY_ID route */
export type TDeleteByIdResponseConfig = {
  schema?: z.ZodTypeAny;
  headers?: TResponseHeaders;
};

/** Full configuration for DELETE_BY_ID route */
export type TDeleteByIdRouteConfig = TRouteAuthConfig & {
  request?: TDeleteByIdRequestConfig;
  response?: TDeleteByIdResponseConfig;
};

// -----------------------------------------------------------------------------
// DELETE_BY Route Config
// -----------------------------------------------------------------------------

/** Request configuration for DELETE_BY route */
export type TDeleteByRequestConfig = {
  query?: TAnyObjectSchema;
  headers?: TAnyObjectSchema;
};

/** Response configuration for DELETE_BY route */
export type TDeleteByResponseConfig = {
  schema?: z.ZodTypeAny;
  headers?: TResponseHeaders;
};

/** Full configuration for DELETE_BY route */
export type TDeleteByRouteConfig = TRouteAuthConfig & {
  request?: TDeleteByRequestConfig;
  response?: TDeleteByResponseConfig;
};

// -----------------------------------------------------------------------------
// Routes Config
// -----------------------------------------------------------------------------

/**
 * Per-route configuration for CRUD controller endpoints.
 *
 * Each route supports full customization of:
 * - Authentication (skipAuth, authStrategies)
 * - Request (query, params, body, headers)
 * - Response (schema, headers)
 *
 * @example
 * ```typescript
 * const routes: TRoutesConfig = {
 *   count: {
 *     skipAuth: true,
 *     request: {
 *       query: z.object({ where: CustomWhereSchema }),
 *       headers: z.object({ 'x-tenant-id': z.string() }),
 *     },
 *     response: {
 *       schema: z.object({ total: z.number() }),
 *     },
 *   },
 *   find: {
 *     request: {
 *       query: z.object({ filter: FilterSchema, search: z.string().optional() }),
 *     },
 *     response: {
 *       schema: CustomFindResponseSchema,
 *     },
 *   },
 *   create: {
 *     authStrategies: ['jwt'],
 *     request: {
 *       body: CreateUserSchema,
 *       headers: z.object({ 'x-idempotency-key': z.string().uuid() }),
 *     },
 *     response: {
 *       schema: UserResponseSchema,
 *       headers: { 'x-resource-id': { description: 'Created ID', schema: { type: 'string' } } },
 *     },
 *   },
 * };
 * ```
 */
export type TRoutesConfig = {
  count?: TCountRouteConfig;
  find?: TFindRouteConfig;
  findById?: TFindByIdRouteConfig;
  findOne?: TFindOneRouteConfig;
  create?: TCreateRouteConfig;
  updateById?: TUpdateByIdRouteConfig;
  updateBy?: TUpdateByRouteConfig;
  deleteById?: TDeleteByIdRouteConfig;
  deleteBy?: TDeleteByRouteConfig;
};
