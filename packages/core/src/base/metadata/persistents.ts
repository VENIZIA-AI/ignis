import {
  IDataSourceMetadata,
  IModelMetadata,
  IRepositoryMetadata,
  MetadataRegistry,
} from '@vez/ignis-helpers';

export const model = (metadata: IModelMetadata): ClassDecorator => {
  return target => {
    MetadataRegistry.setModelMetadata({ target, metadata });
  };
};

export const datasource = (metadata: IDataSourceMetadata): ClassDecorator => {
  return target => {
    MetadataRegistry.setDataSourceMetadata({ target, metadata });
  };
};

export const repository = (metadata: IRepositoryMetadata): ClassDecorator => {
  return target => {
    MetadataRegistry.setRepositoryMetadata({ target, metadata });
  };
};
