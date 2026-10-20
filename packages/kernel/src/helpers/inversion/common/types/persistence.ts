import type { IDataSource, TDataSourceDriverClass } from '@/base/datasources';
import type { AbstractEntity } from '@/base/models';
import type {
  IRepository,
  RepositoryTypes,
  TRepositoryOperationScope,
  TRepositoryType,
} from '@/base/repositories';
import type { TClass, TValueOrResolver } from '@venizia/ignis-helpers/common';
import type { IArtifactRegistrationOptions, TDecoratorTarget } from './artifact';

export interface IDataSourceMetadata extends IArtifactRegistrationOptions {
  driver?: TDataSourceDriverClass;
  autoDiscovery?: boolean;
}

/** Members every repository type shares. */
export interface IRepositoryMetadataBase<
  DataSource extends IDataSource = IDataSource,
> extends IArtifactRegistrationOptions {
  dataSource: string | TValueOrResolver<TClass<DataSource>>;
  operationScope?: TRepositoryOperationScope;
}

/** `RepositoryTypes.MODEL` - the default when `type` is omitted - a model this application declares. */
export interface IRepositoryMetadata<
  Model extends AbstractEntity = AbstractEntity,
  DataSource extends IDataSource = IDataSource,
> extends IRepositoryMetadataBase<DataSource> {
  type?: typeof RepositoryTypes.MODEL;
  model: TValueOrResolver<TClass<Model>>;
}

/** `RepositoryTypes.REMOTE` - data behind another service's API: a datasource and no model. */
export interface IRemoteRepositoryMetadata<
  DataSource extends IDataSource = IDataSource,
> extends IRepositoryMetadataBase<DataSource> {
  type: typeof RepositoryTypes.REMOTE;
  model?: never;
}

/** What `@repository` accepts, discriminated on `type`. */
export type TRepositoryMetadata<
  Model extends AbstractEntity = AbstractEntity,
  DataSource extends IDataSource = IDataSource,
> = IRepositoryMetadata<Model, DataSource> | IRemoteRepositoryMetadata<DataSource>;

/** Resolved repository metadata after lazy evaluation. */
export interface IResolvedRepositoryMetadata<
  Model extends AbstractEntity = AbstractEntity,
  DataSource extends IDataSource = IDataSource,
> {
  type?: TRepositoryType;
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
