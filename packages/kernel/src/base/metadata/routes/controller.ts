import type { TControllerMetadata } from '@/helpers/inversion';
import { ArtifactTypes, MetadataRegistry } from '@/helpers/inversion';
import { injectable, splitRegistrationOptions } from '../injectable';

export const controller = (metadata: TControllerMetadata): ClassDecorator => {
  return target => {
    const { registration, rest } = splitRegistrationOptions({ metadata });
    injectable({ type: ArtifactTypes.CONTROLLER, ...registration })(target);
    MetadataRegistry.getInstance().setControllerMetadata({
      target,
      metadata: rest as TControllerMetadata,
    });
  };
};
