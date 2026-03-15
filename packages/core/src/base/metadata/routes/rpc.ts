import { IRpcMetadata } from '@/helpers/inversion/common/types';
import { MetadataRegistry } from '@/helpers/inversion/registry';
import { GRPC } from '@venizia/ignis-helpers';

/** Generic RPC decorator. Registers RPC config in metadata registry. */
export const rpc = <RpcRouteConfigType extends IRpcMetadata>(opts: {
  configs: RpcRouteConfigType;
}) => {
  return function (
    target: any,
    propertyKey: string | symbol,
    _descriptor: PropertyDescriptor,
  ): void {
    MetadataRegistry.getInstance().addRpc({
      target,
      methodName: propertyKey,
      configs: opts.configs,
    });
  };
};

/** Unary RPC decorator. Equivalent to @rpc but automatically sets method to 'unary'. */
export const unary = <RpcRouteConfigType extends Omit<IRpcMetadata, 'method'>>(opts: {
  configs: RpcRouteConfigType;
}) => {
  return rpc({
    configs: { ...opts.configs, method: GRPC.Methods.UNARY } as RpcRouteConfigType & {
      method: typeof GRPC.Methods.UNARY;
    },
  });
};

/** Server streaming RPC decorator. Equivalent to @rpc but automatically sets method to 'server_streaming'. */
export const serverStream = <RpcRouteConfigType extends Omit<IRpcMetadata, 'method'>>(opts: {
  configs: RpcRouteConfigType;
}) => {
  return rpc({
    configs: { ...opts.configs, method: GRPC.Methods.SERVER_STREAMING } as RpcRouteConfigType & {
      method: typeof GRPC.Methods.SERVER_STREAMING;
    },
  });
};

/** Client streaming RPC decorator. Equivalent to @rpc but automatically sets method to 'client_streaming'. */
export const clientStream = <RpcRouteConfigType extends Omit<IRpcMetadata, 'method'>>(opts: {
  configs: RpcRouteConfigType;
}) => {
  return rpc({
    configs: { ...opts.configs, method: GRPC.Methods.CLIENT_STREAMING } as RpcRouteConfigType & {
      method: typeof GRPC.Methods.CLIENT_STREAMING;
    },
  });
};

/** Bidirectional streaming RPC decorator. Equivalent to @rpc but automatically sets method to 'bidi_streaming'. */
export const bidiStream = <RpcRouteConfigType extends Omit<IRpcMetadata, 'method'>>(opts: {
  configs: RpcRouteConfigType;
}) => {
  return rpc({
    configs: { ...opts.configs, method: GRPC.Methods.BIDI_STREAMING } as RpcRouteConfigType & {
      method: typeof GRPC.Methods.BIDI_STREAMING;
    },
  });
};
