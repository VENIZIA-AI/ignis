export interface IGrpcComponentConfig {
  interceptors?: unknown[];
}

export class GrpcBindingKeys {
  static readonly GRPC_COMPONENT_OPTIONS = '@app/grpc/options';
}
