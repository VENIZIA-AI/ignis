import type { TAuthMode, TAuthStrategy } from '@/base/auth/authenticate/common';
import type { IAuthorizationSpec } from '@/base/auth/authorize/common/types';
import type { ControllerTransports } from '@/base/controllers/common/constants';
import type { IDataSource, TDataSourceDriverClass } from '@/base/datasources';
import type { AbstractEntity } from '@/base/models';
import type {
  IRepository,
  TFilter,
  TRepositoryOperationScope,
  TScopeFilterMissingBehavior,
  TWhere,
} from '@/base/repositories';
import type {
  TClass,
  TGrpcMethod,
  TNullable,
  TValueOrResolver,
} from '@venizia/ignis-helpers/common';
import {
  type IInjectMetadata as _IInjectMetadata,
  type IPropertyMetadata as _IPropertyMetadata,
} from '@venizia/ignis-inversion';

interface IBaseControllerMetadata {
  path: string;
  tags?: string[];
  description?: string;
}

export interface IRestControllerMetadata extends IBaseControllerMetadata {
  transport?: typeof ControllerTransports.REST;
}

export interface IGrpcControllerMetadata<ServiceType = unknown> extends IBaseControllerMetadata {
  transport: typeof ControllerTransports.GRPC;
  service: ServiceType;
}

export type TControllerMetadata = IRestControllerMetadata | IGrpcControllerMetadata;

export interface IRpcMetadata {
  /** Proto method name. */
  name: string;

  /** RPC method type (unary, server_streaming, etc.). */
  method: TGrpcMethod;

  /** Authentication config for this RPC method. */
  authenticate?: { strategies?: TAuthStrategy[]; mode?: TAuthMode };

  /** Authorization spec(s) for this RPC method. */
  authorize?: IAuthorizationSpec | IAuthorizationSpec[];
}

export interface IPropertyMetadata extends _IPropertyMetadata {}

export interface IInjectMetadata extends _IInjectMetadata {}

/** Decorator target for any constructable class (includes Function for ClassDecorator). */
export type TDecoratorTarget<T = unknown> = TClass<T> | Function;

export interface IModelAuthorizeSettings {
  /** The authorization principal name (resource/subject) for this model. */
  principal: string;
  /** Extensible - consumers can add any extra authorization metadata. */
  [extra: string | symbol]: any;
}

/**
 * Row-scope resolver for `@model` settings.scopeFilter - resolved per query, so it can depend on
 * the current request (tenant, org, membership). Framework-internal escape hatches aside, nothing
 * short of removing this setting from the model turns scoping off.
 */
export interface IScopeFilterSettings {
  /** Returns the scope `where`, or null/undefined when this caller's scope cannot be determined. */
  resolve: () => TNullable<TWhere>;

  /**
   * What `applyScopeFilter` does when `resolve()` returns null/undefined - no request context, no
   * tenant, a background job. Defaults to `deny`: an unresolved scope matches zero rows, never
   * every row. `allow` is an explicit, reviewed opt-out for migrations and background jobs.
   */
  onMissing?: TScopeFilterMissingBehavior;
}

export interface IModelSettings {
  /** Properties excluded from all query results at SQL level. */
  hiddenProperties?: string[];

  /** Default filter auto-applied to all repository operations. Bypassable via shouldSkipDefaultFilter. */
  defaultFilter?: TFilter;

  /**
   * Row scope: ANDed into every read and write, and NOT removable by `shouldSkipDefaultFilter`.
   * Resolved per query, so it can depend on the current request.
   *
   * Relational repositories only - a search-backed model (Typesense, Meilisearch) never reads
   * this setting, so mirroring a scoped entity into a search index needs its own query-time scope.
   */
  scopeFilter?: IScopeFilterSettings;

  /** Default row limit when a query omits `limit`. Must be a positive integer. Falls back to DEFAULT_LIMIT (10). */
  defaultLimit?: number;

  /**
   * Largest `limit` a CALLER may ask for. Must be a positive integer. Falls back to
   * DEFAULT_MAX_LIMIT (1000).
   *
   * Policy, not capacity - the engine's own ceiling sits far above it. The number is chosen so
   * that reaching it means the caller is doing something unusual, and raising it is how a model
   * says so deliberately.
   */
  maxLimit?: number;

  /** Authorization settings for this model (principal name, etc.). */
  authorize?: IModelAuthorizeSettings;
}

export interface IModelMetadata {
  type: 'entity' | 'view';
  tableName?: string;
  skipMigrate?: boolean;
  settings?: IModelSettings;
}

export interface IEntityStatics {
  schema?: unknown;
  relations?: TValueOrResolver<Array<unknown>>;
}

export type TModelClass<Model extends AbstractEntity = AbstractEntity> = TClass<Model> &
  IEntityStatics;

/** Decorator target for model classes (supports both strongly typed and ClassDecorator patterns). */
export type TDecoratorModelTarget<Model extends AbstractEntity = AbstractEntity> =
  TModelClass<Model> | (Function & IEntityStatics);

export interface IDataSourceMetadata {
  driver?: TDataSourceDriverClass;
  autoDiscovery?: boolean;
}

export interface IRepositoryMetadata<
  Model extends AbstractEntity = AbstractEntity,
  DataSource extends IDataSource = IDataSource,
> {
  model: TValueOrResolver<TClass<Model>>;
  dataSource: string | TValueOrResolver<TClass<DataSource>>;
  operationScope?: TRepositoryOperationScope;
}

/** Resolved repository metadata after lazy evaluation. */
export interface IResolvedRepositoryMetadata<
  Model extends AbstractEntity = AbstractEntity,
  DataSource extends IDataSource = IDataSource,
> {
  model?: TClass<Model>;
  dataSource?: string | TClass<DataSource>;
  operationScope?: TRepositoryOperationScope;
}

export interface IModelRegistryEntry<Model extends AbstractEntity = AbstractEntity> {
  target: TValueOrResolver<TClass<Model>>;
  metadata: IModelMetadata;
  schema: unknown;

  /** Lazy resolver to avoid circular deps. Resolved when DataSource builds schema. */
  relationsResolver?: TValueOrResolver<Array<unknown>>;

  /** Cache populated on first buildSchema() call. */
  _builtRelations?: unknown;
}

export interface IRepositoryBinding<
  Model extends AbstractEntity = AbstractEntity,
  DataSource extends IDataSource = IDataSource,
> {
  model: TValueOrResolver<TClass<Model>>;
  repository: TValueOrResolver<TDecoratorTarget<IRepository>>;
  dataSource: TValueOrResolver<string | TDecoratorTarget<DataSource>>;
}
