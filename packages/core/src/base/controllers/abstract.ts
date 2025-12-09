import { authenticate } from '@/components/auth';
import { htmlResponse } from '@/utilities/jsx.utility';
import { createRoute, Hook, OpenAPIHono, RouteConfig } from '@hono/zod-openapi';
import { BaseHelper, MetadataRegistry, TAuthStrategy, ValueOrPromise } from '@vez/ignis-helpers';
import { Env, Schema } from 'hono';
import {
  IController,
  IControllerOptions,
  TAuthRouteConfig,
  TLazyRouteHandler,
  TRouteBindingOptions,
  TRouteDefinition,
} from './common/types';

// -----------------------------------------------------------------------------
export abstract class AbstractController<
  RouteEnv extends Env = Env,
  RouteSchema extends Schema = {},
  BasePath extends string = '/',
  ConfigurableOptions extends object = {},
>
  extends BaseHelper
  implements IController<RouteEnv, RouteSchema, BasePath, ConfigurableOptions>
{
  router: OpenAPIHono<RouteEnv, RouteSchema, BasePath>;
  definitions: Record<string, TAuthRouteConfig<RouteConfig>>;

  // ------------------------------------------------------------------------------
  constructor(opts: IControllerOptions) {
    super(opts);
    const { isStrict = true } = opts;

    this.router = new OpenAPIHono<RouteEnv, RouteSchema, BasePath>({
      strict: isStrict,
      defaultHook: (result, _context) => {
        if (!result.success) {
          throw result.error;
        }
      },
    });
  }

  // ------------------------------------------------------------------------------
  getRouter() {
    return this.router;
  }

  // ------------------------------------------------------------------------------
  registerRoutesFromRegistry(): void {
    const routes = MetadataRegistry.getInstance().getRoutes({
      target: Object.getPrototypeOf(this),
    });

    if (!routes?.size) {
      return;
    }

    const routeDefs = routes.entries();
    for (const [methodName, routeConfigs] of routeDefs) {
      console.log(methodName, routeConfigs);
      this.bindRoute({ configs: routeConfigs }).to({
        handler: this[methodName].bind(this),
      });
    }
  }

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

  getRouteConfigs<RC extends TAuthRouteConfig<RouteConfig>>(opts: { configs: RC }) {
    const { configs } = opts;

    const { authStrategies = [], ...restConfig } = configs;

    const security = authStrategies.map(strategy => ({ [strategy]: [] }));
    const mws = authStrategies?.map(strategy => authenticate({ strategy })) ?? [];

    const extraMws =
      restConfig.middleware && Array.isArray(restConfig.middleware)
        ? restConfig.middleware
        : [restConfig.middleware];

    for (const mw of extraMws) {
      if (!mw) {
        continue;
      }

      mws.push(mw);
    }
    const { tags = [] } = configs;

    return createRoute<string, RC>(
      Object.assign({}, configs, {
        middleware: mws,
        tags: [...tags, this.scope],
        security,
      }),
    );
  }

  getJSXRouteConfigs<RC extends RouteConfig & { authStrategies?: Array<TAuthStrategy> }>(opts: {
    configs: RC;
  }) {
    const { configs } = opts;

    const { authStrategies = [], ...restConfig } = configs;

    const security = authStrategies.map(strategy => ({ [strategy]: [] }));
    const mws = authStrategies?.map(strategy => authenticate({ strategy })) ?? [];

    const extraMws =
      restConfig.middleware && Array.isArray(restConfig.middleware)
        ? restConfig.middleware
        : [restConfig.middleware];

    for (const mw of extraMws) {
      mws.push(mw);
    }
    const { responses, tags = [] } = configs;

    return createRoute<string, RC>(
      Object.assign({}, configs, {
        responses: Object.assign({}, htmlResponse({ description: 'HTML page' }), responses),
        tags: [...tags, this.scope],
        security,
      }),
    );
  }

  // ------------------------------------------------------------------------------
  // Notes: user can use `bindRoute` or `defineRoute` in this function to functionally add controller route(s)
  abstract binding(): ValueOrPromise<void>;

  abstract bindRoute<RC extends TAuthRouteConfig<RouteConfig>>(opts: {
    configs: RC;
  }): TRouteBindingOptions<RC, RouteEnv, RouteSchema, BasePath>;

  abstract defineRoute<RC extends TAuthRouteConfig<RouteConfig>>(opts: {
    configs: RC;
    handler: TLazyRouteHandler<RC, RouteEnv>;
    hook?: Hook<any, RouteEnv, string, ValueOrPromise<any>>;
  }): TRouteDefinition<RC, RouteEnv, RouteSchema, BasePath>;
}
