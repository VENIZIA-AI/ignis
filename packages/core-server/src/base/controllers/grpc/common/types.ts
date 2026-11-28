import type { TRouteContext } from '@venizia/ignis-kernel';
import type { IRpcMetadata } from '@venizia/ignis-kernel';
import type {
  ConnectRouter,
  createContextKey,
  createContextValues,
  HandlerContext,
} from '@connectrpc/connect';
import type { UniversalServerRequest, UniversalServerResponse } from '@connectrpc/connect/protocol';
import type { IConfigurable, ValueOrPromise } from '@venizia/ignis-helpers/common';
import type { Env, Hono, Next, Schema } from 'hono';

/**
 * The ConnectRPC peer itself, handed over by an application that already holds it. A
 * `bun build --compile` binary carries no `node_modules`, so the lookup {@link GrpcRequestAdapter} makes with
 * `ModuleUtility.load` has nothing to resolve against - passing the modules through the gRPC
 * component options (or `ModuleUtility.register`) is what a compiled application does instead. Both entry points are needed: the
 * adapter builds its router and context values from `@connectrpc/connect` and converts requests with
 * `@connectrpc/connect/protocol`. Typed as the shape the adapter actually calls, so a wrong module
 * is a compile error rather than a boot crash.
 */
export interface IConnectRpcModule {
  connect: {
    createConnectRouter: (opts?: Record<string, unknown>) => ConnectRouter;
    createContextKey: typeof createContextKey;
    createContextValues: typeof createContextValues;
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

/**
 * Typed handler signature for gRPC RPC methods. `rpc` is ConnectRPC's own context of the call: `signal` (aborted at the
 * deadline and when the client leaves; a handler that ignores it runs on), `timeoutMs()`, `requestHeader`,
 * `responseHeader` and `responseTrailer`.
 */
export type TRpcHandler<
  RequestType = unknown,
  ResponseType = unknown,
  RouteEnv extends Env = Env,
> = (opts: {
  request: RequestType;
  context: TRouteContext<RouteEnv>;
  rpc: HandlerContext;
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
export interface IConnectAdapterResult<RouteEnv extends Env = Env> {
  paths: string[];
  /** One route per RPC, at ConnectRPC's path (`/package.Service/Method`); mount it under the controller's path. */
  router: Hono<RouteEnv>;
}
