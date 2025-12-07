import { authenticate } from '@/components/auth';
import { createRoute, Hook, OpenAPIHono, RouteConfig } from '@hono/zod-openapi';
import { BaseHelper, TAuthStrategy, ValueOrPromise } from '@vez/ignis-helpers';
import { Env, Schema } from 'hono';
import { jsonResponse } from '../models';
import {
  IController,
  IControllerOptions,
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

  getRouteConfigs<RC extends RouteConfig & { authStrategies?: Array<TAuthStrategy> }>(opts: {
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
        responses: Object.assign({}, jsonResponse({ description: 'Success Response' }), responses),
        tags: [...tags, this.scope],
        security,
      }),
    );
  }

  // ------------------------------------------------------------------------------
  abstract binding(): ValueOrPromise<void>;

  abstract bindRoute<RC extends RouteConfig & { authStrategies?: Array<TAuthStrategy> }>(opts: {
    configs: RC;
  }): TRouteBindingOptions<RC, RouteEnv, RouteSchema, BasePath>;

  abstract defineRoute<
    RC extends RouteConfig & { authStrategies?: Array<TAuthStrategy> },
    AuthRC extends RC & { authStrategies?: Array<TAuthStrategy> },
  >(opts: {
    configs: AuthRC;
    handler: TLazyRouteHandler<RC>;
    hook?: Hook<any, RouteEnv, string, ValueOrPromise<any>>;
  }): TRouteDefinition<RC, RouteEnv, RouteSchema, BasePath>;
}
