import type { IConnectRpcModule } from '@/base/controllers/grpc/common/types';

// Re-exported so an application can name the type without reaching into the base barrel.
export type { IConnectRpcModule };

export interface IGrpcComponentConfig {
  interceptors?: unknown[];
  /** The ConnectRPC peer, for a compiled binary that has no `node_modules` to resolve it from. */
  module?: IConnectRpcModule;
}

export class GrpcBindingKeys {
  static readonly GRPC_COMPONENT_OPTIONS = '@app/grpc/options';
}
