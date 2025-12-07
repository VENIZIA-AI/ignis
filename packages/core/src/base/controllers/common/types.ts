import { TTableSchemaWithId } from '@/base/models';
import { IRepository } from '@/base/repositories';
import type { RouteConfig, RouteHandler } from '@hono/zod-openapi';
import { createRoute, Hook, OpenAPIHono } from '@hono/zod-openapi';
import { IConfigurable, TAuthStrategy, ValueOrPromise } from '@vez/ignis-helpers';
import { Env, Schema } from 'hono';

export type TLazyRouteHandler<RC extends RouteConfig> = RC extends RC ? RouteHandler<RC> : never;

export type TRouteDefinition<
  RC extends RouteConfig & { authStrategies?: Array<TAuthStrategy> },
  RouteEnv extends Env = Env,
  RouteSchema extends Schema = {},
  BasePath extends string = '/',
> = {
  configs: ReturnType<typeof createRoute<string, RC>>;
  route: OpenAPIHono<RouteEnv, RouteSchema, BasePath>;
};

export type TRouteBindingOptions<
  RC extends RouteConfig & { authStrategies?: Array<TAuthStrategy> },
  RouteEnv extends Env = Env,
  RouteSchema extends Schema = {},
  BasePath extends string = '/',
> = {
  configs: RC;
  to: (opts: {
    handler: TLazyRouteHandler<RC>;
  }) => TRouteDefinition<RC, RouteEnv, RouteSchema, BasePath>;
};

// ----------------------------------------------------------------------------------------------------------------------------------------
// Controller Interface
// ----------------------------------------------------------------------------------------------------------------------------------------
export interface IController<
  RouteEnv extends Env = Env,
  RouteSchema extends Schema = {},
  BasePath extends string = '/',
  ConfigurableOptions extends object = {},
> extends IConfigurable<ConfigurableOptions, OpenAPIHono<RouteEnv, RouteSchema, BasePath>> {
  router: OpenAPIHono<RouteEnv, RouteSchema, BasePath>;

  bindRoute<RC extends RouteConfig & { authStrategies?: Array<TAuthStrategy> }>(opts: {
    configs: RC;
  }): TRouteBindingOptions<RC, RouteEnv, RouteSchema, BasePath>;

  defineRoute<RC extends RouteConfig & { authStrategies?: Array<TAuthStrategy> }>(opts: {
    configs: RC;
    handler: TLazyRouteHandler<RC>;
    hook?: Hook<any, RouteEnv, string, ValueOrPromise<any>>;
  }): TRouteDefinition<RC, RouteEnv, RouteSchema, BasePath>;

  /* defineAuthRoute<RC extends RouteConfig & { authStrategies: Array<TAuthStrategy> }>(opts: {
    configs: RC;
    handler: TLazyRouteHandler<RC>;
    hook?: Hook<any, RouteEnv, string, ValueOrPromise<any>>;
  }): TRouteDefinition<RouteEnv, RouteSchema, BasePath>; */
}

// ----------------------------------------------------------------------------------------------------------------------------------------
// TODO Fix any type
export interface ICrudController<
  R extends TTableSchemaWithId = any,
  S extends TTableSchemaWithId = any,
  T extends TTableSchemaWithId = any,
> extends IController {
  defaultLimit: number;
  relation?: { name: string; type: string };

  repository?: IRepository<R>;
  sourceRepository?: IRepository<S>;
  targetRepository?: IRepository<T>;
}

export interface IControllerOptions {
  scope: string;
  path: string;
  isStrict?: boolean;
}
