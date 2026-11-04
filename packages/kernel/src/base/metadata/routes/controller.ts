import type { TControllerMetadata } from '@/helpers/inversion';
import { ArtifactTypes, MetadataRegistry } from '@/helpers/inversion';
import { injectable, InjectableUtility } from '../injectable';

/**
 * Class decorator that registers the class as a controller artifact and stores its `path`, tags and transport (REST by default, or gRPC with a `service`).
 *
 * @example
 * ```typescript
 * import { BaseRestController, controller } from '@venizia/ignis';
 *
 * export @controller({ path: '/orders', tags: ['Order'] })
 * class OrderController extends BaseRestController {
 *   constructor() {
 *     super({ scope: OrderController.name, path: '/orders' });
 *   }
 *
 *   override binding(): void {}
 * }
 * ```
 */
export const controller = (metadata: TControllerMetadata): ClassDecorator => {
  return (target) => {
    injectable({
      type: ArtifactTypes.CONTROLLER,
      ...InjectableUtility.pickRegistrationOptions({ metadata }),
    })(target);
    MetadataRegistry.getInstance().setControllerMetadata({ target, metadata });
  };
};
