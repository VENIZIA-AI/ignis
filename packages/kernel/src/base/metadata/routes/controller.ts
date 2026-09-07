import type { TControllerMetadata } from '@/helpers/inversion';
import { ArtifactTypes, MetadataRegistry } from '@/helpers/inversion';
import { injectable, pickRegistrationOptions } from '../injectable';

export const controller = (metadata: TControllerMetadata): ClassDecorator => {
  return target => {
    injectable({ type: ArtifactTypes.CONTROLLER, ...pickRegistrationOptions({ metadata }) })(
      target,
    );
    MetadataRegistry.getInstance().setControllerMetadata({ target, metadata });
  };
};
