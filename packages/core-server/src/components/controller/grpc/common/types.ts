import type { Interceptor } from '@connectrpc/connect';
import type { IConnectRpcModule, IGrpcLimits } from '@/base/controllers/grpc/common/types';
import type { IGrpcNativeOptions } from '@/base/controllers/grpc/native/common/types';
import type { GrpcListenerHelper } from '@/base/controllers/grpc/native/listener.helper';
import { BindingKeys } from '@venizia/ignis-inversion';
import type { TToggle } from '@venizia/ignis-kernel';

// Re-exported so an application can name the type without reaching into the base barrel.
export type { IConnectRpcModule };

export type { IGrpcLimits, IGrpcNativeOptions };

/** Options of `GrpcComponent`, bound at `GrpcBindingKeys.GRPC_COMPONENT_OPTIONS`. */
export interface IGrpcComponentConfig {
  /** ConnectRPC `Interceptor`s of every RPC. They run before `authenticate` and `authorize`. */
  interceptors?: Interceptor[];
  /** Limits of both ports. */
  limits?: IGrpcLimits;
  /** The ConnectRPC peer, for a compiled binary that has no `node_modules` to resolve it from. */
  module?: IConnectRpcModule;
  /** The native gRPC port. Absent or `{ use: false }`: no second socket, and `node:http2` is not loaded. */
  native?: TToggle<IGrpcNativeOptions>;
}

/** Container keys of the gRPC component. */
export class GrpcBindingKeys {
  static readonly GRPC_COMPONENT_OPTIONS = BindingKeys.build<IGrpcComponentConfig>({
    key: '@app/grpc/options',
  });

  /** The listener of the native gRPC port, bound when it is on: `getAddress()` answers where it listens. */
  static readonly GRPC_NATIVE_LISTENER = BindingKeys.build<GrpcListenerHelper>({
    key: '@app/grpc/native-listener',
  });
}
