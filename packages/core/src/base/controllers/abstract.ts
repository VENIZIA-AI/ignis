import { authenticate as authenticateFn, AuthenticationModes } from '@/components/auth';
import { MetadataRegistry } from '@/helpers/inversion';
import { htmlResponse } from '@/utilities/jsx.utility';
import { createRoute, Hook, OpenAPIHono } from '@hono/zod-openapi';
import { BaseHelper, getError, ValueOrPromise } from '@venizia/ignis-helpers';
import { Env, Schema } from 'hono';
import {
  IController,
  IControllerOptions,
  IAuthenticateRouteConfig,
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
  Definitions extends Record<string, IAuthenticateRouteConfig> = Record<
    string,
    IAuthenticateRouteConfig
  >,
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

    const configureOptions = opts ?? {};
    this.logger.info('[configure] START | Binding controller | Options: %j', configureOptions);

    await this.binding();
    this.registerRoutesFromRegistry();

    this.logger.info(
      '[configure] DONE | Binding controller | Took: %s (ms)',
      performance.now() - t,
    );
    return this.router;
  }

  /**
   * Processes route configuration, adding authentication middleware and OpenAPI metadata.
   *
   * Transforms a route config by:
   * - Converting `authenticate.strategies` to OpenAPI security requirements
   * - Creating authentication middleware based on strategies and mode
   * - Adding the controller scope to route tags
   * - Merging any existing middleware
   *
   * @typeParam RouteConfig - The route configuration type
   * @param opts - Object containing the route configuration
   * @returns Processed route configuration ready for registration
   */
  getRouteConfigs<RouteConfig extends IAuthenticateRouteConfig>(opts: { configs: RouteConfig }) {
    const { configs } = opts;

    const { authenticate = {}, ...restConfig } = configs;
    const { strategies = [], mode = AuthenticationModes.ANY } = authenticate;

    const security = strategies.map(strategy => ({ [strategy]: [] }));
    const mws = strategies.length > 0 ? [authenticateFn({ strategies, mode })] : [];

    if (restConfig.middleware) {
      const extraMws = Array.isArray(restConfig.middleware)
        ? restConfig.middleware
        : [restConfig.middleware];

      for (const mw of extraMws) {
        if (!mw) {
          continue;
        }

        mws.push(mw);
      }
    }

    const { tags = [] } = configs;

    return createRoute<string, RouteConfig>(
      Object.assign({}, configs, {
        middleware: mws,
        tags: [...tags, this.scope],
        security,
      }),
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
  getJSXRouteConfigs<RouteConfig extends IAuthenticateRouteConfig>(opts: { configs: RouteConfig }) {
    const { configs } = opts;

    const { authenticate = {}, ...restConfig } = configs;
    const { strategies = [], mode = AuthenticationModes.ANY } = authenticate;

    const security = strategies.map(strategy => ({ [strategy]: [] }));
    const mws = strategies.length > 0 ? [authenticateFn({ strategies, mode })] : [];

    const extraMws =
      restConfig.middleware && Array.isArray(restConfig.middleware)
        ? restConfig.middleware
        : [restConfig.middleware];

    for (const mw of extraMws) {
      mws.push(mw);
    }
    const { responses, tags = [] } = configs;

    return createRoute<string, RouteConfig>(
      Object.assign({}, configs, {
        responses: Object.assign({}, htmlResponse({ description: 'HTML page' }), responses),
        tags: [...tags, this.scope],
        security,
      }),
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
  abstract bindRoute<RouteConfig extends IAuthenticateRouteConfig>(opts: {
    configs: RouteConfig;
  }): IBindRouteOptions<RouteConfig, RouteEnv, RouteSchema, BasePath>;

  /**
   * Defines and registers a route with its handler in a single call.
   *
   * @param opts - Object containing route config, handler, and optional hook
   * @returns The registered route definition
   */
  abstract defineRoute<RouteConfig extends IAuthenticateRouteConfig, ResponseType = unknown>(opts: {
    configs: RouteConfig;
    handler: TRouteHandler<ResponseType, RouteEnv>;
    hook?: Hook<any, RouteEnv, string, ValueOrPromise<any>>;
  }): IDefineRouteOptions<RouteConfig, RouteEnv, RouteSchema, BasePath>;
}
