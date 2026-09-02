import type { AbstractEntity } from '@/base/models';
import type { TAuthMode, TAuthStrategy } from '@/base/auth/authenticate/common/constants';
import type { IAuthorizationSpec } from '@/base/auth/authorize/common/types';
import type {
  IConfigurable,
  TClass,
  TResolver,
  ValueOrPromise,
} from '@venizia/ignis-helpers/common';
import type { Hook, OpenAPIHono } from '@hono/zod-openapi';
import type { Env, Schema } from 'hono';
import type { TRouteHandler } from './context';
import type {
  IAuthRouteConfig,
  IBindRouteOptions,
  ICustomizableRoutes,
  IDefineRouteOptions,
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
  /** When true (default), /users and /users/ are different routes. */
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

/** Configuration options for creating a CRUD controller via ControllerFactory.defineCrudController. */
export interface ICrudControllerOptions<
  TEntity extends AbstractEntity = AbstractEntity,
  Routes extends ICustomizableRoutes = ICustomizableRoutes,
> {
  /** Entity class or resolver returning it - its schema drives the inferred DataObject/PersistObject types of the generated controller's `repository`. */
  entity: TClass<TEntity> | TResolver<TClass<TEntity>>;

  /** Repository binding configuration */
  repository: {
    name: string; // Repository binding name in the IoC container
  };

  controller: {
    name: string;
    basePath: string;
    readonly?: boolean;

    /** Whitelist of routes to register; overrides per-route `enabled` flags in `routes` when set. */
    enabledRoutes?: Array<keyof ICustomizableRoutes>;

    isStrict?: {
      path?: boolean;
      requestSchema?: boolean;
    };
  };

  /** Authentication config applied to all routes (unless overridden per-route). */
  authenticate?: { strategies?: TAuthStrategy[]; mode?: TAuthMode };

  /** Authorization config applied to all routes (unless overridden per-route). */
  authorize?: IAuthorizationSpec | IAuthorizationSpec[];

  /** Per-route configuration combining schema and auth overrides. */
  routes?: Routes;
}
