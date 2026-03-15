import { TMixinTarget } from '@venizia/ignis-helpers';
import { MetadataRegistry as _MetadataRegistry } from '@venizia/ignis-inversion';
import { MetadataKeys } from '../../common/keys';
import { IRpcMetadata } from '../../common/types';

export const GrpcControllerMetadataMixin = <BaseClass extends TMixinTarget<_MetadataRegistry>>(
  baseClass: BaseClass,
) => {
  return class extends baseClass {
    /** Store RPC method metadata on a controller prototype. */
    addRpc<Target extends object = object>(opts: {
      target: Target;
      methodName: string | symbol;
      configs: IRpcMetadata;
    }): void {
      const { target, methodName, configs } = opts;
      const rpcs = this.getRpcs({ target }) || new Map();
      rpcs.set(methodName, configs);
      Reflect.defineMetadata(MetadataKeys.CONTROLLER_GRPC_ROUTE, rpcs, target);
    }

    /** Get all RPC methods from a controller class prototype. */
    getRpcs<Target extends object = object>(opts: {
      target: Target;
    }): Map<string | symbol, IRpcMetadata> | undefined {
      const { target } = opts;
      return Reflect.getMetadata(MetadataKeys.CONTROLLER_GRPC_ROUTE, target);
    }

    /** Get a specific RPC method by name. */
    getRpc<Target extends object = object>(opts: {
      target: Target;
      methodName: string | symbol;
    }): IRpcMetadata | undefined {
      const { target, methodName } = opts;
      const rpcs = this.getRpcs({ target });
      return rpcs?.get(methodName);
    }

    /** Check if a class has any RPC methods defined. */
    hasRpcs<Target extends object = object>(opts: { target: Target }): boolean {
      const rpcs = this.getRpcs(opts);
      return rpcs !== undefined && rpcs.size > 0;
    }
  };
};
