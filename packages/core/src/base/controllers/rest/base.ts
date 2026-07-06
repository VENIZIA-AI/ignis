import { Hook, OpenAPIHono } from '@hono/zod-openapi';
import { ValueOrPromise } from '@venizia/ignis-helpers';
import { Env, Schema } from 'hono';
import {
  IAuthRouteConfig,
  IBindRouteOptions,
  IDefineRouteOptions,
  TRouteHandler,
} from '../common/types';
import { AbstractRestController } from './abstract';

/** Recommended base class for REST controllers with concrete bindRoute and defineRoute implementations. */
export abstract class BaseRestController<
  RouteEnv extends Env = Env,
  RouteSchema extends Schema = {},
  BasePath extends string = '/',
  ConfigurableOptions extends object = {},
  Definitions extends Record<string, IAuthRouteConfig> = Record<string, IAuthRouteConfig>,
> extends AbstractRestController<
  RouteEnv,
  RouteSchema,
  BasePath,
  ConfigurableOptions,
  Definitions
> {
  /** TRouteHandler's TRouteContext is a lightweight custom shape (different `json`/`req.valid`
   * signatures) built on top of Hono's real Context, not a subtype of the RouteHandler Hono's
   * `.openapi()` expects - genuinely different handler types being bridged at this call boundary. */
  toHonoHandler<ResponseType = unknown>(opts: { handler: TRouteHandler<ResponseType, RouteEnv> }) {
    return opts.handler as Parameters<OpenAPIHono<RouteEnv>['openapi']>[1];
  }

  /** Creates a fluent binding for registering a route (call .to() to attach handler). */
  bindRoute<RouteConfig extends IAuthRouteConfig>(opts: {
    configs: RouteConfig;
  }): IBindRouteOptions<RouteConfig, RouteEnv, RouteSchema, BasePath> {
    const routeConfigs = this.getRouteConfigs<RouteConfig>({ configs: opts.configs });

    return {
      configs: routeConfigs,
      to: ({ handler }) => {
        return {
          configs: routeConfigs,
          route: this.router.openapi(routeConfigs, this.toHonoHandler({ handler })),
        };
      },
    };
  }

  /** Defines and registers a route with its handler in a single call. */
  defineRoute<RouteConfig extends IAuthRouteConfig, ResponseType = unknown>(opts: {
    configs: RouteConfig;
    handler: TRouteHandler<ResponseType, RouteEnv>;
    hook?: Hook<any, RouteEnv, string, ValueOrPromise<any>>;
  }): IDefineRouteOptions<RouteConfig, RouteEnv, RouteSchema, BasePath> {
    const routeConfigs = this.getRouteConfigs<RouteConfig>({ configs: opts.configs });

    return {
      configs: routeConfigs,
      route: this.router.openapi(
        routeConfigs,
        this.toHonoHandler<ResponseType>({ handler: opts.handler }),
        opts.hook,
      ),
    };
  }

  /** Defines a JSX route that renders server-side HTML via c.html(). */
  defineJSXRoute<RouteConfig extends IAuthRouteConfig, ResponseType = unknown>(opts: {
    configs: RouteConfig;
    handler: TRouteHandler<ResponseType, RouteEnv>;
    hook?: Hook<any, RouteEnv, string, ValueOrPromise<any>>;
  }): IDefineRouteOptions<RouteConfig, RouteEnv, RouteSchema, BasePath> {
    const routeConfigs = this.getJSXRouteConfigs<RouteConfig>({ configs: opts.configs });

    return {
      configs: routeConfigs,
      route: this.router.openapi(
        routeConfigs,
        this.toHonoHandler<ResponseType>({ handler: opts.handler }),
        opts.hook,
      ),
    };
  }
}
