import { ValueOrPromise } from '@/common/types';
import { createRoute, Hook, OpenAPIHono, RouteConfig } from '@hono/zod-openapi';
import { Env, Handler, Schema } from 'hono';
import { BaseHelper } from '../helpers';
import { IController, IControllerOptions, TAuthStrategy, TRouteDefinition } from './types';

export abstract class BaseController<
    RouteEnv extends Env = Env,
    RouteSchema extends Schema = {},
    BasePath extends string = '/',
  >
  extends BaseHelper
  implements IController<RouteEnv, RouteSchema, BasePath>
{
  protected tags: string[];
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

  async configure(): Promise<OpenAPIHono<RouteEnv, RouteSchema, BasePath>> {
    const t = performance.now();
    this.logger.info('[configure] START | Binding controller');

    await this.binding();

    this.logger.info(
      '[configure] DONE | Binding controller | Took: %s (ms)',
      performance.now() - t,
    );
    return this.router;
  }

  // ------------------------------------------------------------------------------
  protected defineRoute<RC extends RouteConfig>(opts: {
    configs: RC;
    handler: Handler<RouteEnv>;
    hook?: Hook<any, RouteEnv, string, ValueOrPromise<any>>;
  }): TRouteDefinition<RouteEnv, RouteSchema, BasePath> {
    const { configs, handler, hook } = opts;
    const routeConfig = createRoute<string, RC>({
      ...configs,
      tags: [...(configs?.tags ?? []), this._scope],
    });

    return {
      routeConfig,
      route: this.router.openapi(routeConfig, handler, hook),
    };
  }

  // ------------------------------------------------------------------------------
  protected defineAuthRoute<
    RC extends RouteConfig & { authStrategies: Array<TAuthStrategy> },
  >(opts: {
    configs: RC;
    handler: Handler<RouteEnv>;
    hook?: Hook<any, RouteEnv, string, ValueOrPromise<any>>;
  }): TRouteDefinition<RouteEnv, RouteSchema, BasePath> {
    const { configs, handler, hook } = opts;
    const { authStrategies, ...restConfig } = configs;

    return this.defineRoute<Omit<RC, 'authStrategies'>>({
      configs: {
        ...restConfig,
        security: authStrategies.map(strategy => ({ [strategy]: [] })),
      },
      handler,
      hook,
    });
  }
}
