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
/** Abstract base class for all controllers, providing route registration and auth middleware integration. */
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
  router: OpenAPIHono<RouteEnv, RouteSchema, BasePath>;
  /** Route definitions map, keyed by route identifier (e.g., 'FIND', 'CREATE'). */
  definitions: Definitions;
  path: string;

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

  /** Returns the OpenAPIHono router instance for this controller. */
  getRouter() {
    return this.router;
  }

  /** Registers routes defined via decorators (@get, @post, etc.) from the metadata registry. */
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

  /** Configures the controller by binding all routes and registering decorator-based routes. */
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

  /** Processes route config, injecting auth middleware and OpenAPI security specs. */
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

  /** Like getRouteConfigs but adds HTML response schema for JSX rendering. */
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
  /** Override to register routes using bindRoute or defineRoute. */
  abstract binding(): ValueOrPromise<void>;

  /** Creates a fluent binding for registering a route (call .to() to attach handler). */
  abstract bindRoute<RouteConfig extends IAuthRouteConfig>(opts: {
    configs: RouteConfig;
  }): IBindRouteOptions<RouteConfig, RouteEnv, RouteSchema, BasePath>;

  /** Defines and registers a route with its handler in a single call. */
  abstract defineRoute<RouteConfig extends IAuthRouteConfig, ResponseType = unknown>(opts: {
    configs: RouteConfig;
    handler: TRouteHandler<ResponseType, RouteEnv>;
    hook?: Hook<any, RouteEnv, string, ValueOrPromise<any>>;
  }): IDefineRouteOptions<RouteConfig, RouteEnv, RouteSchema, BasePath>;
}
