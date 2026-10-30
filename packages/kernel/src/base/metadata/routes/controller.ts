import type { TControllerMetadata } from '@/helpers/inversion';
import { ArtifactTypes, MetadataRegistry } from '@/helpers/inversion';
import { injectable, InjectableUtility } from '../injectable';

export const controller = (metadata: TControllerMetadata): ClassDecorator => {
  return (target) => {
    injectable({
      type: ArtifactTypes.CONTROLLER,
      ...InjectableUtility.pickRegistrationOptions({ metadata }),
    })(target);
    MetadataRegistry.getInstance().setControllerMetadata({ target, metadata });
  };
};
