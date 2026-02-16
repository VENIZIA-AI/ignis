import { AuthenticationModes } from '@/components/auth/authenticate/common/constants';
import { authenticate as authenticateFn } from '@/components/auth/authenticate/middlewares/authenticate.middleware';
import { authorize as authorizeFn } from '@/components/auth/authorize/middlewares/authorize.middleware';
import { IAuthorizationSpec } from '@/components/auth/authorize/common/types';
import { MetadataRegistry } from '@/helpers/inversion/registry';
import { htmlResponse } from '@/utilities/jsx.utility';
import { createRoute, Hook, OpenAPIHono } from '@hono/zod-openapi';
import { BaseHelper, getError, ValueOrPromise } from '@venizia/ignis-helpers';
import { Env, Schema } from 'hono';
import {
  IController,
  IControllerOptions,
  IAuthRouteConfig,
  IBindRouteOptions,
  IDefineRouteOptions,
  TRouteHandler,
} from './common/types';

// -----------------------------------------------------------------------------

/**
 * Abstract base class for all controllers in the Ignis framework.
 *
 * Provides core functionality for:
 * - Route registration and configuration
 * - Authentication middleware integration
 * - OpenAPI schema generation
 * - Decorator-based route binding
 *
 * Extend this class (or {@link BaseController}) to create custom controllers.
 *
 * @typeParam RouteEnv - Hono environment type for context variables
 * @typeParam RouteSchema - Combined schema type for all routes
 * @typeParam BasePath - Base path prefix for the router
 * @typeParam ConfigurableOptions - Options passed during configuration
 * @typeParam Definitions - Route definitions map type for strongly-typed method overrides
 *
 * @example
 * ```typescript
 * class UserController extends AbstractController {
 *   async binding() {
 *     this.defineRoute({
 *       configs: { path: '/', method: 'get', ... },
 *       handler: async (c) => c.json({ users: [] })
 *     });
 *   }
 *
 *   bindRoute(opts) { ... }
 *   defineRoute(opts) { ... }
 * }
 * ```
 */
export abstract class AbstractController<
  RouteEnv extends Env = Env,
  RouteSchema extends Schema = {},
  BasePath extends string = '/',
  ConfigurableOptions extends object = {},
  Definitions extends Record<string, IAuthRouteConfig> = Record<string, IAuthRouteConfig>,
>
  extends BaseHelper
  implements IController<RouteEnv, RouteSchema, BasePath, ConfigurableOptions>
{
  /** The OpenAPIHono router instance managing all routes for this controller */
  router: OpenAPIHono<RouteEnv, RouteSchema, BasePath>;

  /**
   * Route definitions map, keyed by route identifier (e.g., 'FIND', 'CREATE').
   *
   * @example
   * ```typescript
   * // Override a CRUD method with explicit typing:
   * override async create(_opts: { context: TTypedContext }) {
   *   const { context } = _opts;
   *   const data = context.req.valid<{ name: string }>('json');
   *   return super.create(_opts);
   * }
   * ```
   */
  definitions: Definitions;

  /** The base path for all routes in this controller */
  path: string;

  /**
   * Creates a new controller instance.
   *
   * @param opts - Controller configuration options
   * @throws Error if no path is provided via constructor or decorator
   */
  constructor(opts: IControllerOptions) {
    super(opts);
    const { isStrict = true } = opts;

    // Resolve path: decorator metadata takes priority, then constructor option
    const decoratorMetadata = MetadataRegistry.getInstance().getControllerMetadata({
      target: new.target,
    });
    const resolvedPath = decoratorMetadata?.path ?? opts.path;

    if (!resolvedPath) {
      throw getError({
        message: `[${new.target.name}] Controller path is required. Provide path via @controller decorator or constructor options.`,
      });
    }

    this.path = resolvedPath;

    this.router = new OpenAPIHono<RouteEnv, RouteSchema, BasePath>({
      strict: isStrict,
      defaultHook: (result, _context) => {
        if (!result.success) {
          throw result.error;
        }
      },
    });
  }

  /**
   * Returns the OpenAPIHono router instance for this controller.
   *
   * @returns The configured router with all registered routes
   */
  getRouter() {
    return this.router;
  }

  /**
   * Registers routes defined via decorators (e.g., `@get`, `@post`) from the metadata registry.
   *
   * Called automatically during {@link configure}. Iterates through decorator-defined
   * routes and binds them to their handler methods.
   */
  registerRoutesFromRegistry(): void {
    const routes = MetadataRegistry.getInstance().getRoutes({
      target: Object.getPrototypeOf(this),
    });

    if (!routes?.size) {
      return;
    }

    const routeDefs = routes.entries();
    for (const [methodName, routeConfigs] of routeDefs) {
      this.bindRoute({ configs: routeConfigs }).to({
        handler: this[methodName].bind(this),
      });
    }
  }

  /**
   * Configures the controller by binding all routes and registering decorator-based routes.
   *
   * This is the main entry point called by the application during startup.
   * It executes the {@link binding} method and then registers any decorator-defined routes.
   *
   * @param opts - Optional configuration options passed to the controller
   * @returns The configured OpenAPIHono router ready for mounting
   */
  async configure(
    opts?: ConfigurableOptions,
  ): Promise<OpenAPIHono<RouteEnv, RouteSchema, BasePath>> {
    const t = performance.now();
    const logger = this.logger.for(this.configure.name);

    const configureOptions = opts ?? {};
    logger.info('START | Binding controller | Options: %j', configureOptions);

    await this.binding();
    this.registerRoutesFromRegistry();

    logger.info('DONE | Binding controller | Took: %s (ms)', performance.now() - t);
    return this.router;
  }

  /**
   * Processes route configuration, adding authentication middleware and OpenAPI metadata.
   *
   * Transforms a route config by:
   * - Converting `authenticate.strategies` to OpenAPI security specs
   * - Creating authentication middleware based on strategies and mode
   * - Adding the controller scope to route tags
   * - Merging any existing middleware
   *
   * @typeParam RouteConfig - The route configuration type
   * @param opts - Object containing the route configuration
   * @returns Processed route configuration ready for registration
   */
  getRouteConfigs<RouteConfig extends IAuthRouteConfig>(opts: { configs: RouteConfig }) {
    const { configs } = opts;

    const { authenticate = {}, authorize, ...restConfig } = configs;
    const { strategies = [], mode = AuthenticationModes.ANY } = authenticate;

    const security = strategies.map((strategy: string) => ({ [strategy]: [] }));
    const mws: ReturnType<typeof authenticateFn>[] = [];

    // Inject authenticate middleware
    if (strategies.length > 0) {
      mws.push(authenticateFn({ strategies, mode }));
    }

    // Inject authorize middleware AFTER authenticate
    if (authorize) {
      const specs: IAuthorizationSpec[] = Array.isArray(authorize) ? authorize : [authorize];
      for (const spec of specs) {
        mws.push(authorizeFn({ spec }));
      }
    }

    // Inject custom middleware
    if (restConfig.middleware) {
      const extraMws = Array.isArray(restConfig.middleware)
        ? restConfig.middleware
        : [restConfig.middleware];

      for (const mw of extraMws) {
        if (mw) {
          mws.push(mw);
        }
      }
    }

    const { tags = [] } = restConfig;

    return createRoute<string, RouteConfig>(
      Object.assign({}, restConfig, {
        middleware: mws,
        tags: [...tags, this.scope],
        security,
      }) as unknown as RouteConfig,
    );
  }

  /**
   * Processes JSX route configuration for server-side rendered HTML responses.
   *
   * Similar to {@link getRouteConfigs} but automatically adds HTML response
   * schema for JSX rendering. Use with {@link BaseController.defineJSXRoute}.
   *
   * @typeParam RouteConfig - The route configuration type
   * @param opts - Object containing the route configuration
   * @returns Processed route configuration with HTML response schema
   */
  getJSXRouteConfigs<RouteConfig extends IAuthRouteConfig>(opts: { configs: RouteConfig }) {
    const { configs } = opts;

    const { authenticate = {}, authorize, ...restConfig } = configs;
    const { strategies = [], mode = AuthenticationModes.ANY } = authenticate;

    const security = strategies.map((strategy: string) => ({ [strategy]: [] }));
    const mws: ReturnType<typeof authenticateFn>[] = [];

    // Inject authenticate middleware
    if (strategies.length > 0) {
      mws.push(authenticateFn({ strategies, mode }));
    }

    // Inject authorize middleware AFTER authenticate
    if (authorize) {
      const specs: IAuthorizationSpec[] = Array.isArray(authorize) ? authorize : [authorize];
      for (const spec of specs) {
        mws.push(authorizeFn({ spec }));
      }
    }

    // Inject custom middleware
    if (restConfig.middleware) {
      const extraMws = Array.isArray(restConfig.middleware)
        ? restConfig.middleware
        : [restConfig.middleware];

      for (const mw of extraMws) {
        if (mw) {
          mws.push(mw);
        }
      }
    }

    const { responses, tags = [] } = restConfig;

    return createRoute<string, RouteConfig>(
      Object.assign({}, restConfig, {
        responses: Object.assign({}, htmlResponse({ description: 'HTML page' }), responses),
        tags: [...tags, this.scope],
        security,
      }) as unknown as RouteConfig,
    );
  }

  // -----------------------------------------------------------------------------
  // Abstract Methods
  // -----------------------------------------------------------------------------

  /**
   * Defines controller routes. Override this method to register routes.
   *
   * Called during {@link configure}. Use {@link bindRoute} or {@link defineRoute}
   * within this method to register routes.
   *
   * @example
   * ```typescript
   * binding() {
   *   this.defineRoute({
   *     configs: { path: '/', method: 'get', responses: { ... } },
   *     handler: (c) => c.json({ message: 'Hello' })
   *   });
   * }
   * ```
   */
  abstract binding(): ValueOrPromise<void>;

  /**
   * Creates a fluent binding for registering a route with two-step pattern.
   *
   * @param opts - Object containing route configuration
   * @returns Binding options with `to()` method for attaching the handler
   */
  abstract bindRoute<RouteConfig extends IAuthRouteConfig>(opts: {
    configs: RouteConfig;
  }): IBindRouteOptions<RouteConfig, RouteEnv, RouteSchema, BasePath>;

  /**
   * Defines and registers a route with its handler in a single call.
   *
   * @param opts - Object containing route config, handler, and optional hook
   * @returns The registered route definition
   */
  abstract defineRoute<RouteConfig extends IAuthRouteConfig, ResponseType = unknown>(opts: {
    configs: RouteConfig;
    handler: TRouteHandler<ResponseType, RouteEnv>;
    hook?: Hook<any, RouteEnv, string, ValueOrPromise<any>>;
  }): IDefineRouteOptions<RouteConfig, RouteEnv, RouteSchema, BasePath>;
}
