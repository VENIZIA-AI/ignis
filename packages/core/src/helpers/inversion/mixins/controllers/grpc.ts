import type { TMixinTarget } from '@venizia/ignis-helpers';
import type { MetadataRegistry as _MetadataRegistry } from '@venizia/ignis-inversion';
import { MetadataKeys } from '../../common/keys';
import type { IRpcMetadata } from '../../common/types';

export const GrpcControllerMetadataMixin = <BaseClass extends TMixinTarget<_MetadataRegistry>>(
  baseClass: BaseClass,
) => {
  return class extends baseClass {
    addRpc<Target extends object = object>(opts: {
      target: Target;
      methodName: string | symbol;
      configs: IRpcMetadata;
    }): void {
      const { target, methodName, configs } = opts;

      // Copy-on-write, same reason as RestControllerMetadataMixin.addRoute: getRpcs() walks the prototype chain, so mutating the Map it returns would leak a subclass's rpcs onto its base.
      const inherited = this.getRpcs({ target });
      const rpcs: Map<string | symbol, IRpcMetadata> =
        Reflect.getOwnMetadata(MetadataKeys.CONTROLLER_GRPC_ROUTE, target) ??
        new Map(inherited ?? []);

      rpcs.set(methodName, configs);
      Reflect.defineMetadata(MetadataKeys.CONTROLLER_GRPC_ROUTE, rpcs, target);
    }

    getRpcs<Target extends object = object>(opts: {
      target: Target;
    }): Map<string | symbol, IRpcMetadata> | undefined {
      const { target } = opts;
      return Reflect.getMetadata(MetadataKeys.CONTROLLER_GRPC_ROUTE, target);
    }

    getRpc<Target extends object = object>(opts: {
      target: Target;
      methodName: string | symbol;
    }): IRpcMetadata | undefined {
      const { target, methodName } = opts;
      const rpcs = this.getRpcs({ target });
      return rpcs?.get(methodName);
    }

    hasRpcs<Target extends object = object>(opts: { target: Target }): boolean {
      const rpcs = this.getRpcs(opts);
      return rpcs !== undefined && rpcs.size > 0;
    }
  };
};
