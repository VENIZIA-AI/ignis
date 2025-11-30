import { IConfigurable, ValueOptional } from '@/common/types';
import { createRoute, OpenAPIHono, RouteConfig } from '@hono/zod-openapi';
import { Env, Schema } from 'hono';
import { TTableSchemaWithId } from '../models';
import { IRepository } from '../repositories';

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

export type TRouteConfig = ValueOptional<RouteConfig, 'responses'>;
export type TRouteDefinition<
  RouteEnv extends Env = Env,
  RouteSchema extends Schema = {},
  BasePath extends string = '/',
> = {
  routeConfig: ReturnType<typeof createRoute>;
  route: OpenAPIHono<RouteEnv, RouteSchema, BasePath>;
};
