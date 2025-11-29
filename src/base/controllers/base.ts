import { TAuthStrategy, ValueOrPromise } from '@/common/types';
import { authenticate } from '@/components/auth';
import { jsonResponse } from '@/utilities/schema.utility';
import { createRoute, Hook, OpenAPIHono, RouteConfig } from '@hono/zod-openapi';
import { Env, Handler, Schema } from 'hono';
import { BaseHelper } from '../helpers';
import { IController, IControllerOptions, TRouteConfig, TRouteDefinition } from './types';

export abstract class BaseController<
  RouteEnv extends Env = Env,
  RouteSchema extends Schema = {},
  BasePath extends string = '/',
  ConfigurableOptions extends object = {},
>
  extends BaseHelper
  implements IController<RouteEnv, RouteSchema, BasePath, ConfigurableOptions>
{
  tags: string[];
  router: OpenAPIHono<RouteEnv, RouteSchema, BasePath>;

  constructor(opts: IControllerOptions) {
    super(opts);
    const { isStrict = true } = opts;
    this.router = new OpenAPIHono<RouteEnv, RouteSchema, BasePath>({ strict: isStrict });
  }

  abstract binding(): ValueOrPromise<void>;

  // ------------------------------------------------------------------------------
  getRouter() {
    return this.router;
  }

  async configure(
    opts?: ConfigurableOptions,
  ): Promise<OpenAPIHono<RouteEnv, RouteSchema, BasePath>> {
    const t = performance.now();

    const configureOptions = opts ?? {};
    this.logger.info('[configure] START | Binding controller | Options: %j', configureOptions);

    await this.binding();

    this.logger.info(
      '[configure] DONE | Binding controller | Took: %s (ms)',
      performance.now() - t,
    );
    return this.router;
  }

  // ------------------------------------------------------------------------------
  defineRoute<RC extends TRouteConfig>(opts: {
    configs: RC;
    handler: Handler<RouteEnv>;
    hook?: Hook<any, RouteEnv, string, ValueOrPromise<any>>;
  }): TRouteDefinition<RouteEnv, RouteSchema, BasePath> {
    const { configs, handler, hook } = opts;
    const { responses, tags = [] } = configs;

    const routeConfig = createRoute<string, RouteConfig>(
      Object.assign({}, configs, {
        responses: Object.assign({}, jsonResponse({ description: 'Success Response' }), responses),
        tags: [...tags, this.scope],
      }),
    );

    return {
      routeConfig,
      route: this.router.openapi(routeConfig, handler, hook),
    };
  }

  // ------------------------------------------------------------------------------
  defineAuthRoute<RC extends TRouteConfig & { authStrategies: Array<TAuthStrategy> }>(opts: {
    configs: RC;
    handler: Handler<RouteEnv>;
    hook?: Hook<any, RouteEnv, string, ValueOrPromise<any>>;
  }): TRouteDefinition<RouteEnv, RouteSchema, BasePath> {
    const { configs, handler, hook } = opts;

    const { authStrategies, ...restConfig } = configs;
    const security = authStrategies.map(strategy => ({ [strategy]: [] }));

    const mws = authStrategies.map(strategy => authenticate({ strategy }));
    if (restConfig.middleware !== undefined && restConfig.middleware !== null) {
      if (Array.isArray(restConfig.middleware)) {
        for (const mw of restConfig.middleware) {
          mws.push(mw);
        }
      } else {
        mws.push(restConfig.middleware);
      }
    }

    return this.defineRoute<Omit<RC, 'authStrategies'>>({
      configs: { ...restConfig, middleware: mws, security },
      handler,
      hook,
    });
  }
}
