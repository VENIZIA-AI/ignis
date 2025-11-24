import { IDataSourceMetadata, IModelMetadata, MetadataRegistry } from '@/helpers/inversion';

export const model = (metadata: IModelMetadata): ClassDecorator => {
  return target => {
    MetadataRegistry.setModelMetadata({ target, metadata });
  };
};

export const datasource = (metadata?: IDataSourceMetadata): ClassDecorator => {
  return target => {
    MetadataRegistry.setDataSourceMetadata({ target, metadata });
  };
};
