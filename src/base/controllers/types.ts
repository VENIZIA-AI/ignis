import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import { Env, Schema } from 'hono';
import { IRepository } from '../repositories';

// ----------------------------------------------------------------------------------------------------------------------------------------
export type TAuthStrategy = 'jwt' | 'basic';

// ----------------------------------------------------------------------------------------------------------------------------------------
// Controller Interface
// ----------------------------------------------------------------------------------------------------------------------------------------
export interface IController<
  RouteEnv extends Env = Env,
  RouteSchema extends Schema = {},
  BasePath extends string = '/',
> {
  router: OpenAPIHono<RouteEnv, RouteSchema, BasePath>;

  configure(): Promise<OpenAPIHono<RouteEnv, RouteSchema, BasePath>>;
}

export interface ICrudController extends IController {
  defaultLimit: number;
  relation?: { name: string; type: string };
  repository?: IRepository;
  sourceRepository?: IRepository;
  targetRepository?: IRepository;
}

export interface IControllerOptions {
  scope: string;
  path: string;
  isStrict?: boolean;
}

export type TRouteDefinition<
  RouteEnv extends Env = Env,
  RouteSchema extends Schema = {},
  BasePath extends string = '/',
> = {
  routeConfig: ReturnType<typeof createRoute>;
  route: OpenAPIHono<RouteEnv, RouteSchema, BasePath>;
};
