import type { TRouteContext } from '@/base/controllers/common/types';
import type { IRpcMetadata } from '@/helpers/inversion/common/types';
import type { ConnectRouter } from '@connectrpc/connect';
import type { UniversalServerRequest, UniversalServerResponse } from '@connectrpc/connect/protocol';
import type { IConfigurable, ValueOrPromise } from '@venizia/ignis-helpers/common';
import type { Env, Hono, Input, MiddlewareHandler, Next, Schema } from 'hono';

/**
 * The ConnectRPC peer itself, handed over by an application that already holds it. A
 * `bun build --compile` binary carries no `node_modules`, so the `createRequire` fallback in
 * {@link GrpcRequestAdapter} has nothing to resolve against - passing the modules through the gRPC
 * component options is what a compiled application does instead. Both entry points are needed: the
 * adapter builds its router from `@connectrpc/connect` and converts requests with
 * `@connectrpc/connect/protocol`. Typed as the shape the adapter actually calls, so a wrong module
 * is a compile error rather than a boot crash.
 */
export interface IConnectRpcModule {
  connect: {
    createConnectRouter: (opts?: Record<string, unknown>) => ConnectRouter;
  };
  protocol: {
    universalServerRequestFromFetch: (request: Request, context: object) => UniversalServerRequest;
    universalServerResponseToFetch: (response: UniversalServerResponse) => Response;
  };
}

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

/** Pre-built middleware function for gRPC auth enforcement. */
export type TRpcMiddleware<RouteEnv extends Env = Env> = (
  context: TRouteContext<RouteEnv>,
  next: Next,
) => ValueOrPromise<void | Response>;

/** Unified registration entry: metadata + handler + pre-built middlewares stored together. */
export interface IRpcRegistration<RouteEnv extends Env = Env> {
  configs: IRpcMetadata;
  handler: TRpcHandler<unknown, unknown, RouteEnv>;
  middlewares: TRpcMiddleware<RouteEnv>[];
}

/** Return type from defineRoute - contains processed configs. */
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
  router: Hono<RouteEnv, RouteSchema, BasePath>;

  definitions: Record<string, IRpcRegistration<RouteEnv>>;

  getRouter(): Hono<RouteEnv, RouteSchema, BasePath>;

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
