import { TRouteContext } from '@/base/controllers/common/types';
import { IRpcMetadata } from '@/helpers/inversion/common/types';
import type { OpenAPIHono } from '@hono/zod-openapi';
import { IConfigurable, ValueOrPromise } from '@venizia/ignis-helpers';
import type { Env, Input, MiddlewareHandler, Schema } from 'hono';

/** Configuration options for gRPC controller instantiation. */
export interface IGrpcControllerOptions {
  scope: string;
  /** Falls back to @controller decorator path if not provided. */
  path?: string;
}

/** Typed handler signature for gRPC RPC methods. */
export type TRpcHandler<
  RequestType = unknown,
  ResponseType = unknown,
  RouteEnv extends Env = Env,
> = (opts: {
  request: RequestType;
  context: TRouteContext<RouteEnv>;
}) => ValueOrPromise<ResponseType>;

/** Unified registration entry: metadata + handler stored together. */
export interface IRpcRegistration<RouteEnv extends Env = Env> {
  configs: IRpcMetadata;
  handler: TRpcHandler<unknown, unknown, RouteEnv>;
}

/** Return type from defineRoute — contains processed configs. */
export interface IGrpcDefineRouteOptions {
  configs: IRpcMetadata;
}

/** Fluent binding for two-step RPC registration: bindRoute({ configs }).to({ handler }). */
export interface IGrpcBindRouteOptions<RouteEnv extends Env = Env> {
  configs: IRpcMetadata;
  to: (opts: { handler: TRpcHandler<unknown, unknown, RouteEnv> }) => IGrpcDefineRouteOptions;
}

/** gRPC controller interface defining RPC registration and configuration contract. */
export interface IGrpcController<
  RouteEnv extends Env = Env,
  RouteSchema extends Schema = {},
  BasePath extends string = '/',
  ServiceType = unknown,
  ConfigurableOptions extends object = {},
> extends IConfigurable<ConfigurableOptions> {
  service: ServiceType;
  router: OpenAPIHono<RouteEnv, RouteSchema, BasePath>;

  definitions: Record<string, IRpcRegistration<RouteEnv>>;

  getRouter(): OpenAPIHono<RouteEnv, RouteSchema, BasePath>;

  bindRoute(opts: { configs: IRpcMetadata }): IGrpcBindRouteOptions<RouteEnv>;
  defineRoute(opts: {
    configs: IRpcMetadata;
    handler: TRpcHandler<unknown, unknown, RouteEnv>;
  }): IGrpcDefineRouteOptions;
}

/** Result from GrpcRequestAdapter.build(). */
export interface IConnectAdapterResult<
  RouteEnv extends Env = Env,
  BasePath extends string = '/',
  RouteInput extends Input = {},
> {
  paths: string[];
  middleware: MiddlewareHandler<RouteEnv, BasePath, RouteInput>;
}
