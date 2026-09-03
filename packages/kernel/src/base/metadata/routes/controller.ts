import type { TControllerMetadata } from '@/helpers/inversion';
import { MetadataRegistry } from '@/helpers/inversion';

export const controller = (metadata: TControllerMetadata): ClassDecorator => {
  return target => {
    MetadataRegistry.getInstance().setControllerMetadata({ target, metadata });
  };
};
