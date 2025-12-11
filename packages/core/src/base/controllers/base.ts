import { Hook, RouteConfig } from '@hono/zod-openapi';
import { TAuthStrategy, ValueOrPromise } from '@venizia/ignis-helpers';
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

  /**
   * Define a JSX route that renders server-side HTML
   * Scope: [BaseController][defineJSXRoute]
   *
   * JSX routes use Hono's built-in JSX support to render components to HTML.
   * The handler must return c.html() with the JSX component.
   *
   * @example
   * ```typescript
   * this.defineJSXRoute({
   *   configs: {
   *     path: '/profile',
   *     method: 'get',
   *     description: 'User profile page',
   *   },
   *   handler: (c) => {
   *     const user = c.get('user');
   *     return c.html(<ProfilePage user={user} />);
   *   }
   * });
   * ```
   *
   * @param opts - Route configuration and handler
   * @returns Route definition
   */
  defineJSXRoute<RC extends RouteConfig & { authStrategies?: Array<TAuthStrategy> }>(opts: {
    configs: RC;
    handler: TLazyRouteHandler<RC, RouteEnv>;
    hook?: Hook<any, RouteEnv, string, ValueOrPromise<any>>;
  }): TRouteDefinition<RC, RouteEnv, RouteSchema, BasePath> {
    const routeConfigs = this.getJSXRouteConfigs<RC>({ configs: opts.configs });

    return {
      configs: routeConfigs,
      route: this.router.openapi(routeConfigs, opts.handler, opts.hook),
    };
  }
}
