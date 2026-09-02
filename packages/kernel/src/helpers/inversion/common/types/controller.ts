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

export interface IRestControllerMetadata extends IBaseControllerMetadata {
  transport?: typeof ControllerTransports.REST;
}

export interface IGrpcControllerMetadata<ServiceType = unknown> extends IBaseControllerMetadata {
  transport: typeof ControllerTransports.GRPC;
  service: ServiceType;
}

export type TControllerMetadata = IRestControllerMetadata | IGrpcControllerMetadata;

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
