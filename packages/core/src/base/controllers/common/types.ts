import type { RouteConfig, RouteHandler } from '@hono/zod-openapi';
import { createRoute, Hook, OpenAPIHono } from '@hono/zod-openapi';
import { IConfigurable, TAuthStrategy, ValueOrPromise } from '@venizia/ignis-helpers';
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
  /** The created route configuration */
  configs: ReturnType<typeof createRoute<string, RC>>;
  /** The OpenAPIHono router instance with the route registered */
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
  /** The route configuration */
  configs: RC;
  /** Binds the handler and returns the route definition */
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
 *   authStrategies: ['jwt', 'api-key'],
 *   responses: { 200: { ... } }
 * };
 * ```
 */
export type TAuthRouteConfig<RC extends RouteConfig> = RC & {
  authStrategies?: readonly TAuthStrategy[];
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
