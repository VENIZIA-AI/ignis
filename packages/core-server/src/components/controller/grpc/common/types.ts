import type { IConnectRpcModule, IGrpcLimits } from '@/base/controllers/grpc/common/types';
import { BindingKeys } from '@venizia/ignis-inversion';

// Re-exported so an application can name the type without reaching into the base barrel.
export type { IConnectRpcModule };

export type { IGrpcLimits };

/** Options of `GrpcComponent`, bound at `GrpcBindingKeys.GRPC_COMPONENT_OPTIONS`. */
export interface IGrpcComponentConfig {
  interceptors?: unknown[];
  limits?: IGrpcLimits;
  /** The ConnectRPC peer, for a compiled binary that has no `node_modules` to resolve it from. */
  module?: IConnectRpcModule;
}

/** Container keys of the gRPC component. */
export class GrpcBindingKeys {
  static readonly GRPC_COMPONENT_OPTIONS = BindingKeys.build<IGrpcComponentConfig>({
    key: '@app/grpc/options',
  });
}
