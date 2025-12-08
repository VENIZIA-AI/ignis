import type { RouteConfig } from '@hono/zod-openapi';
import { Hook } from '@hono/zod-openapi';
import { ValueOrPromise } from '@vez/ignis-helpers';
import { Env, Schema } from 'hono';
import { AbstractController } from './abstract';
import {
  TAuthRouteConfig,
  TLazyRouteHandler,
  TRouteBindingOptions,
  TRouteDefinition,
} from './common/types';

export abstract class BaseController<
  RouteEnv extends Env = Env,
  RouteSchema extends Schema = {},
  BasePath extends string = '/',
  ConfigurableOptions extends object = {},
> extends AbstractController<RouteEnv, RouteSchema, BasePath, ConfigurableOptions> {
  // ------------------------------------------------------------------------------
  bindRoute<RC extends TAuthRouteConfig<RouteConfig>>(opts: {
    configs: RC;
  }): TRouteBindingOptions<RC, RouteEnv, RouteSchema, BasePath> {
    const routeConfigs = this.getRouteConfigs<RC>({ configs: opts.configs });

    return {
      configs: routeConfigs,
      to: ({ handler }) => {
        return {
          configs: routeConfigs,
          route: this.router.openapi(routeConfigs, handler),
        };
      },
    };
  }

  // ------------------------------------------------------------------------------
  defineRoute<RC extends TAuthRouteConfig<RouteConfig>>(opts: {
    configs: RC;
    handler: TLazyRouteHandler<RC, RouteEnv>;
    hook?: Hook<any, RouteEnv, string, ValueOrPromise<any>>;
  }): TRouteDefinition<RC, RouteEnv, RouteSchema, BasePath> {
    const routeConfigs = this.getRouteConfigs<RC>({ configs: opts.configs });

    return {
      configs: routeConfigs,
      route: this.router.openapi(routeConfigs, opts.handler, opts.hook),
    };
  }
}
