// All type-only (this file only declares metadata interfaces). Kept as `import type` so the DI
// Container's module graph (registry -> this file) never pulls the @/base/* value barrels at load,
// which would cycle back through AbstractApplication `extends Container` into a TDZ.
import type { ControllerTransports } from '@/base/controllers/common/constants';
import type { IDataSource, TDataSourceDriver } from '@/base/datasources';
import type { AbstractEntity } from '@/base/models';
import type { IRepository, TFilter, TRepositoryOperationScope } from '@/base/repositories';
import type { TAuthMode, TAuthStrategy } from '@/components/auth/authenticate/common';
import type { IAuthorizationSpec } from '@/components/auth/authorize/common/types';
import type { TClass, TGrpcMethod, TValueOrResolver } from '@venizia/ignis-helpers';
import {
    type IInjectMetadata as _IInjectMetadata,
    type IPropertyMetadata as _IPropertyMetadata,
    type TBindingScope,
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

export interface IInjectableMetadata {
  scope?: TBindingScope;
  tags?: Record<string, any>;
}

/** Decorator target for any constructable class (includes Function for ClassDecorator). */
export type TDecoratorTarget<T = unknown> = TClass<T> | Function;

export interface IModelAuthorizeSettings {
  /** The authorization principal name (resource/subject) for this model. */
  principal: string;
  /** Extensible — consumers can add any extra authorization metadata. */
  [extra: string | symbol]: any;
}

export interface IModelSettings {
  /** Properties excluded from all query results at SQL level. */
  hiddenProperties?: string[];

  /** Default filter auto-applied to all repository operations. Bypassable via shouldSkipDefaultFilter. */
  defaultFilter?: TFilter;

  /** Default row limit when a query omits `limit`. Must be a positive integer. Falls back to DEFAULT_LIMIT (10). */
  defaultLimit?: number;

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
  driver: TDataSourceDriver;
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
