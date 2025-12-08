import {
  IDataSourceMetadata,
  IModelMetadata,
  IRepositoryMetadata,
  MetadataRegistry,
} from '@vez/ignis-helpers';

export const model = (metadata: IModelMetadata): ClassDecorator => {
  return target => {
    MetadataRegistry.getInstance().setModelMetadata({ target, metadata });
  };
};

export const datasource = (metadata: IDataSourceMetadata): ClassDecorator => {
  return target => {
    MetadataRegistry.getInstance().setDataSourceMetadata({ target, metadata });
  };
};

export const repository = (metadata: IRepositoryMetadata): ClassDecorator => {
  return target => {
    MetadataRegistry.getInstance().setRepositoryMetadata({ target, metadata });
  };
};
