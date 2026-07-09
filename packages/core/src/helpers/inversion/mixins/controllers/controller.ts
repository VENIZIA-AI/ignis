import { ControllerTransports } from '@/base/controllers/common/constants';
import type { TMixinTarget } from '@venizia/ignis-helpers';
import type { MetadataRegistry as _MetadataRegistry } from '@venizia/ignis-inversion';
import { MetadataKeys } from '../../common/keys';
import type {
  IGrpcControllerMetadata,
  IRestControllerMetadata,
  TControllerMetadata,
} from '../../common/types';

export const ControllerMetadataMixin = <BaseClass extends TMixinTarget<_MetadataRegistry>>(
  baseClass: BaseClass,
) => {
  return class extends baseClass {
    setControllerMetadata<Target extends object = object>(opts: {
      target: Target;
      metadata: TControllerMetadata;
    }): void {
      const { target, metadata } = opts;
      const existing = this.getControllerMetadata({ target }) || {};
      Reflect.defineMetadata(
        MetadataKeys.CONTROLLER,
        Object.assign({}, existing, metadata),
        target,
      );
    }

    getControllerMetadata<Target extends object = object>(opts: {
      target: Target;
    }): TControllerMetadata | undefined {
      const { target } = opts;
      return Reflect.getMetadata(MetadataKeys.CONTROLLER, target);
    }

    getRestControllerMetadata<Target extends object = object>(opts: {
      target: Target;
    }): IRestControllerMetadata | undefined {
      const metadata = this.getControllerMetadata(opts);
      if (!metadata || metadata.transport === ControllerTransports.GRPC) {
        return undefined;
      }
      return metadata as IRestControllerMetadata;
    }

    getGrpcControllerMetadata<Target extends object = object>(opts: {
      target: Target;
    }): IGrpcControllerMetadata | undefined {
      const metadata = this.getControllerMetadata(opts);
      if (metadata?.transport !== ControllerTransports.GRPC) {
        return undefined;
      }
      return metadata as IGrpcControllerMetadata;
    }
  };
};
