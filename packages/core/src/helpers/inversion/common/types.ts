import { IDataSource, TDataSourceDriver } from '@/base/datasources/common';
import { BaseEntity, IEntity, TTableSchemaWithId } from '@/base/models';
import { IRepository, TRepositoryOperationScope } from '@/base/repositories';
import { RouteConfig } from '@hono/zod-openapi';
import { TAuthStrategy, TClass, TValueOrResolver } from '@venizia/ignis-helpers';
import {
  IInjectMetadata as _IInjectMetadata,
  IPropertyMetadata as _IPropertyMetadata,
  TBindingScope,
} from '@venizia/ignis-inversion';
import { relations as defineRelations } from 'drizzle-orm';

// ----------------------------------------------------------------------------------------------------------------------------------------
// Metadata
// ----------------------------------------------------------------------------------------------------------------------------------------
export type TRouteMetadata = RouteConfig & {
  authStrategies?: readonly TAuthStrategy[];
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

/**
 * Type for decorator target for any constructable class.
 * Includes Function to support ClassDecorator pattern.
 */
export type TDecoratorTarget<T = unknown> = TClass<T> | Function;

// ----------------------------------------------------------------------------------------------------------------------------------------
// Model Metadata & Types
// ----------------------------------------------------------------------------------------------------------------------------------------
export interface IModelMetadata {
  type: 'entity' | 'view';
  tableName?: string;
  skipMigrate?: boolean;
}

export type TModelClass<
  Schema extends TTableSchemaWithId = TTableSchemaWithId,
  Model extends BaseEntity<Schema> = BaseEntity<Schema>,
> = TClass<Model> & IEntity<Schema>;

/**
 * Type for decorator target that can be either:
 * - A strongly typed model class (TClass<T> & IEntity<Schema>)
 * - A Function type (from ClassDecorator) with optional IEntity properties
 *
 * ClassDecorators receive Function type, but at runtime they're always constructors.
 * This type allows both strongly typed and decorator usage patterns.
 */
export type TDecoratorModelTarget<
  Schema extends TTableSchemaWithId = TTableSchemaWithId,
  Model extends BaseEntity<Schema> = BaseEntity<Schema>,
> = TModelClass<Schema, Model> | (Function & Partial<IEntity<Schema>>);

// ----------------------------------------------------------------------------------------------------------------------------------------
// DataSource Metadata & Types
// ----------------------------------------------------------------------------------------------------------------------------------------
export interface IDataSourceMetadata {
  driver: TDataSourceDriver;
  autoDiscovery?: boolean;
}

// ----------------------------------------------------------------------------------------------------------------------------------------
// Repository Metadata & Types
// ----------------------------------------------------------------------------------------------------------------------------------------
export interface IRepositoryMetadata<
  Schema extends TTableSchemaWithId = TTableSchemaWithId,
  Model extends BaseEntity<Schema> = BaseEntity<Schema>,
  DataSource extends IDataSource = IDataSource,
> {
  model: TValueOrResolver<TClass<Model>>;
  dataSource: string | TValueOrResolver<TClass<DataSource>>;
  operationScope?: TRepositoryOperationScope;
}

/**
 * Internal resolved repository metadata after lazy evaluation
 */
export interface IResolvedRepositoryMetadata<
  Schema extends TTableSchemaWithId = TTableSchemaWithId,
  Model extends BaseEntity<Schema> = BaseEntity<Schema>,
  DataSource extends IDataSource = IDataSource,
> {
  model?: TClass<Model>;
  dataSource?: string | TClass<DataSource>;
  operationScope?: TRepositoryOperationScope;
}

// ----------------------------------------------------------------------------------------------------------------------------------------
// Registry Types
// ----------------------------------------------------------------------------------------------------------------------------------------
/**
 * Type for Drizzle relations returned by the relations() function
 */
export type TDrizzleRelations = ReturnType<typeof defineRelations>;

export interface IModelRegistryEntry<
  Schema extends TTableSchemaWithId = TTableSchemaWithId,
  Model extends BaseEntity<Schema> = BaseEntity<Schema>,
> {
  target: TValueOrResolver<TClass<Model>>;
  metadata: IModelMetadata;
  schema: Schema;
  /**
   * Lazy relations resolver - stored as function to avoid circular dependency issues.
   * Only resolved when DataSource builds its schema (all models loaded by then).
   */
  relationsResolver?: TValueOrResolver<Array<unknown>>;
  /**
   * Cache for built Drizzle relations - populated on first access via buildSchema().
   */
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
