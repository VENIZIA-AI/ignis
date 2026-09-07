import type { IDataSource, TDataSourceDriverClass } from '@/base/datasources';
import type { AbstractEntity } from '@/base/models';
import type { IRepository, TRepositoryOperationScope } from '@/base/repositories';
import type { TClass, TValueOrResolver } from '@venizia/ignis-helpers/common';
import type { IArtifactRegistrationOptions, TDecoratorTarget } from './artifact';

export interface IDataSourceMetadata extends IArtifactRegistrationOptions {
  driver?: TDataSourceDriverClass;
  autoDiscovery?: boolean;
}

export interface IRepositoryMetadata<
  Model extends AbstractEntity = AbstractEntity,
  DataSource extends IDataSource = IDataSource,
> extends IArtifactRegistrationOptions {
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

export interface IRepositoryBinding<
  Model extends AbstractEntity = AbstractEntity,
  DataSource extends IDataSource = IDataSource,
> {
  model: TValueOrResolver<TClass<Model>>;
  repository: TValueOrResolver<TDecoratorTarget<IRepository>>;
  dataSource: TValueOrResolver<string | TDecoratorTarget<DataSource>>;
}
