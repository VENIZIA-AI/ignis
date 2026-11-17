import type { TAuthMode, TAuthStrategy } from '@/base/auth/authenticate/common';
import type { IAuthorizationSpec } from '@/base/auth/authorize/common/types';
import type { ControllerTransports } from '@/base/controllers/common/constants';
import type { TGrpcMethod } from '@venizia/ignis-helpers/common';
import type { IArtifactRegistrationOptions } from './artifact';

interface IBaseControllerMetadata extends IArtifactRegistrationOptions {
  path: string;
  tags?: string[];
  description?: string;
}

/** Metadata of a REST controller; `transport` may be left out. */
export interface IRestControllerMetadata extends IBaseControllerMetadata {
  transport?: typeof ControllerTransports.REST;
}

/** Metadata of a gRPC controller; `service` is the gRPC service definition it implements. */
export interface IGrpcControllerMetadata<ServiceType = unknown> extends IBaseControllerMetadata {
  transport: typeof ControllerTransports.GRPC;
  service: ServiceType;
}

/** Metadata accepted by `@controller`, discriminated on `transport`. */
export type TControllerMetadata = IRestControllerMetadata | IGrpcControllerMetadata;

/** Metadata of one gRPC method on a controller. */
export interface IRpcMetadata {
  /** Proto method name. */
  name: string;

  /** RPC method type (unary, server_streaming, etc.). */
  method: TGrpcMethod;

  /** Authentication config for this RPC method. */
  authenticate?: { strategies?: TAuthStrategy[]; mode?: TAuthMode };

  /** Authorization spec(s) for this RPC method. */
  authorize?: IAuthorizationSpec | IAuthorizationSpec[];
}
