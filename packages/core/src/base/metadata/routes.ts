import { IControllerMetadata, MetadataRegistry } from '@/helpers/inversion';

export const controller = (metadata: IControllerMetadata): ClassDecorator => {
  return target => {
    MetadataRegistry.setControllerMetadata({ target, metadata });
  };
};
