import { IDataSource, TDataSourceDriver } from '@/base/datasources/common';
import { BaseEntity, IEntity, TTableSchemaWithId } from '@/base/models';
import { IRepository, TFilter, TRepositoryOperationScope } from '@/base/repositories';
import { RouteConfig } from '@hono/zod-openapi';
import { TClass, TValueOrResolver } from '@venizia/ignis-helpers';
import { TAuthMode, TAuthStrategy } from '@/components/auth/authenticate/common';
import {
  type IInjectMetadata as _IInjectMetadata,
  type IPropertyMetadata as _IPropertyMetadata,
  type TBindingScope,
} from '@venizia/ignis-inversion';
import { relations as defineRelations } from 'drizzle-orm';

export type TRouteMetadata = RouteConfig & {
  authenticate?: { strategies?: TAuthStrategy[]; mode?: TAuthMode };
};

export interface IControllerMetadata {
  path: string;
  tags?: string[];
  description?: string;
}

export interface IPropertyMetadata extends _IPropertyMetadata {}

export interface IInjectMetadata extends _IInjectMetadata {}

export interface IInjectableMetadata {
  scope?: TBindingScope;
  tags?: Record<string, any>;
}

/** Decorator target for any constructable class (includes Function for ClassDecorator). */
export type TDecoratorTarget<T = unknown> = TClass<T> | Function;

export interface IModelSettings {
  /** Properties excluded from all query results at SQL level. */
  hiddenProperties?: string[];
  /** Default filter auto-applied to all repository operations. Bypassable via shouldSkipDefaultFilter. */
  defaultFilter?: TFilter;
}

export interface IModelMetadata {
  type: 'entity' | 'view';
  tableName?: string;
  skipMigrate?: boolean;
  settings?: IModelSettings;
}

export type TModelClass<
  Schema extends TTableSchemaWithId = TTableSchemaWithId,
  Model extends BaseEntity<Schema> = BaseEntity<Schema>,
> = TClass<Model> & IEntity<Schema>;

/** Decorator target for model classes (supports both strongly typed and ClassDecorator patterns). */
export type TDecoratorModelTarget<
  Schema extends TTableSchemaWithId = TTableSchemaWithId,
  Model extends BaseEntity<Schema> = BaseEntity<Schema>,
> = TModelClass<Schema, Model> | (Function & Partial<IEntity<Schema>>);

export interface IDataSourceMetadata {
  driver: TDataSourceDriver;
  autoDiscovery?: boolean;
}

export interface IRepositoryMetadata<
  Schema extends TTableSchemaWithId = TTableSchemaWithId,
  Model extends BaseEntity<Schema> = BaseEntity<Schema>,
  DataSource extends IDataSource = IDataSource,
> {
  model: TValueOrResolver<TClass<Model>>;
  dataSource: string | TValueOrResolver<TClass<DataSource>>;
  operationScope?: TRepositoryOperationScope;
}

/** Resolved repository metadata after lazy evaluation. */
export interface IResolvedRepositoryMetadata<
  Schema extends TTableSchemaWithId = TTableSchemaWithId,
  Model extends BaseEntity<Schema> = BaseEntity<Schema>,
  DataSource extends IDataSource = IDataSource,
> {
  model?: TClass<Model>;
  dataSource?: string | TClass<DataSource>;
  operationScope?: TRepositoryOperationScope;
}

/** Drizzle relations return type. */
export type TDrizzleRelations = ReturnType<typeof defineRelations>;

export interface IModelRegistryEntry<
  Schema extends TTableSchemaWithId = TTableSchemaWithId,
  Model extends BaseEntity<Schema> = BaseEntity<Schema>,
> {
  target: TValueOrResolver<TClass<Model>>;
  metadata: IModelMetadata;
  schema: Schema;
  /** Lazy resolver to avoid circular deps. Resolved when DataSource builds schema. */
  relationsResolver?: TValueOrResolver<Array<unknown>>;
  /** Cache populated on first buildSchema() call. */
  _builtRelations?: TDrizzleRelations;
}

export interface IRepositoryBinding<
  Schema extends TTableSchemaWithId = TTableSchemaWithId,
  Model extends BaseEntity<Schema> = BaseEntity<Schema>,
  DataSource extends IDataSource = IDataSource,
> {
  model: TValueOrResolver<TDecoratorModelTarget<Schema, Model>>;
  repository: TValueOrResolver<TDecoratorTarget<IRepository>>;
  dataSource: TValueOrResolver<string | TDecoratorTarget<DataSource>>;
}
