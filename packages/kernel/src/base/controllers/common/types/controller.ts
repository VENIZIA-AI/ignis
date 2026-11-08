import type { IRepository } from '@/base/repositories/common/types/contracts';
import type { TAuthMode, TAuthStrategy } from '@/base/auth/authenticate/common/constants';
import type { IAuthorizationSpec } from '@/base/auth/authorize/common/types';
import type { IConfigurable, TClass, ValueOrPromise } from '@venizia/ignis-helpers/common';
import type { Hook, OpenAPIHono } from '@hono/zod-openapi';
import type { Env, Schema } from 'hono';
import type { TRouteHandler } from './context';
import type {
  IAuthRouteConfig,
  IBindRouteOptions,
  IDefineRouteOptions,
  TCrudRoutes,
} from './route';

/** Base controller interface defining route registration and configuration contract. */
export interface IController<
  RouteEnv extends Env = Env,
  RouteSchema extends Schema = {},
  BasePath extends string = '/',
  ConfigurableOptions extends object = {},
> extends IConfigurable<ConfigurableOptions, OpenAPIHono<RouteEnv, RouteSchema, BasePath>> {
  router: OpenAPIHono<RouteEnv, RouteSchema, BasePath>;

  bindRoute<RouteConfig extends IAuthRouteConfig>(opts: {
    configs: RouteConfig;
  }): IBindRouteOptions<RouteConfig, RouteEnv, RouteSchema, BasePath>;

  /** Defines and registers a route with its handler in a single call. */
  defineRoute<RouteConfig extends IAuthRouteConfig, ResponseType = unknown>(opts: {
    configs: RouteConfig;
    handler: TRouteHandler<ResponseType, RouteEnv>;
    hook?: Hook<any, RouteEnv, string, ValueOrPromise<any>>;
  }): IDefineRouteOptions<RouteConfig, RouteEnv, RouteSchema, BasePath>;
}

/** Configuration options for controller instantiation. */
export interface IControllerOptions {
  scope: string;
  /** Falls back to @controller decorator path if not provided. */
  path?: string;
  /**
   * When true, /users and /users/ are different routes.
   *
   * @default true
   */
  isStrict?: boolean;
}

/** Read object inferred from an entity's engine-neutral `$inferData` phantom marker - each family fills it with its own type, so the base layer needs no connector import; falls back to `object`. */
export type TEntityDataObject<TEntity> = TEntity extends { $inferData?: infer TData }
  ? TData extends object
    ? TData
    : object
  : object;

/** Persist object inferred from an entity's engine-neutral `$inferPersist` phantom marker - same contract and `object` fallback as {@link TEntityDataObject}. */
export type TEntityPersistObject<TEntity> = TEntity extends { $inferPersist?: infer TPersist }
  ? TPersist extends object
    ? TPersist
    : object
  : object;

/** The repository classes a CRUD controller can be built over. */
export type TCrudRepositoryClass = TClass<IRepository>;

/** Read object of a repository, from its `$inferData` phantom marker (the `TDataObject` its `AbstractRepository` base declares); falls back to `object`. */
export type TRepositoryDataObject<Repository> = Repository extends { $inferData?: infer TData }
  ? TData extends object
    ? TData
    : object
  : object;

/** Persist object of a repository, from its `$inferPersist` phantom marker; same contract and `object` fallback as {@link TRepositoryDataObject}. */
export type TRepositoryPersistObject<Repository> = Repository extends {
  $inferPersist?: infer TPersist;
}
  ? TPersist extends object
    ? TPersist
    : object
  : object;

/** Configuration options for creating a CRUD controller via ControllerFactory.crud. */
export interface ICrudControllerOptions<
  Repository extends TCrudRepositoryClass = TCrudRepositoryClass,
> {
  /** The repository class; its name is the binding key and its `@repository` model drives the schemas. */
  repository: Repository;

  isStrict?: {
    path?: boolean;
    requestSchema?: boolean;
  };

  /** Authentication config applied to all routes (unless overridden per-route). */
  authenticate?: { strategies?: TAuthStrategy[]; mode?: TAuthMode };

  /** Authorization config applied to all routes (unless overridden per-route). */
  authorize?: IAuthorizationSpec | IAuthorizationSpec[];

  /** The routes the controller has: a route exists only when listed. */
  routes?: TCrudRoutes<InstanceType<Repository>>;
}
