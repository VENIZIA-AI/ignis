import type { ConnectRouter, HandlerContext } from '@connectrpc/connect';
import type {
  UniversalHandler,
  UniversalServerRequest,
  UniversalServerResponse,
} from '@connectrpc/connect/protocol';
import { GRPC, HTTP, validateModule, ValueOrPromise } from '@venizia/ignis-helpers';
import { Env, Input, MiddlewareHandler, Schema } from 'hono';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createRequire } from 'node:module';
import path from 'node:path';
import { TRouteContext } from '../common';
import type { AbstractGrpcController } from './abstract';
import type { IConnectAdapterResult, IRpcRegistration } from './common/types';

const CONNECT_RPC_MODULES = ['@connectrpc/connect'];

type TConnectHandler<RequestType = unknown, ResponseType = unknown> = (
  request: RequestType,
  context: HandlerContext,
) => ValueOrPromise<ResponseType>;

/**
 * Bridges Ignis gRPC controllers with ConnectRPC's universal handler system.
 *
 * Uses AsyncLocalStorage for request-scoped Hono context isolation —
 * concurrent requests never share or overwrite each other's context.
 *
 * Responsibilities:
 * 1. Load ConnectRPC peer deps at startup via createRequire
 * 2. Wrap Ignis handlers into ConnectRPC's expected signature
 * 3. Produce a Hono middleware that dispatches requests to the correct handler
 */
export class GrpcRequestAdapter<
  RouteEnv extends Env = Env,
  RouteSchema extends Schema = {},
  BasePath extends string = '/',
  ServiceType = Parameters<ConnectRouter['service']>[0],
  ConfigurableOptions extends object = {},
> {
  private createConnectRouter: (opts?: Record<string, unknown>) => ConnectRouter;
  private protocol: {
    universalServerRequestFromFetch: (req: Request, ctx: object) => UniversalServerRequest;
    universalServerResponseToFetch: (res: UniversalServerResponse) => Response;
  };

  private controller: AbstractGrpcController<
    RouteEnv,
    RouteSchema,
    BasePath,
    ServiceType,
    ConfigurableOptions
  >;
  private interceptors?: unknown[];

  private constructor(opts: {
    controller: AbstractGrpcController<
      RouteEnv,
      RouteSchema,
      BasePath,
      ServiceType,
      ConfigurableOptions
    >;
    interceptors?: unknown[];
  }) {
    this.controller = opts.controller;
    this.interceptors = opts.interceptors;

    /** Resolves peer deps from the app's node_modules at runtime — required for single-file builds. */
    const appRequire = createRequire(path.join(process.cwd(), 'node_modules'));

    this.createConnectRouter = appRequire('@connectrpc/connect').createConnectRouter;
    const proto = appRequire('@connectrpc/connect/protocol');

    this.protocol = {
      universalServerRequestFromFetch: proto.universalServerRequestFromFetch,
      universalServerResponseToFetch: proto.universalServerResponseToFetch,
    };
  }

  /** Wraps Ignis RPC registrations into ConnectRPC's (request, context) => response signature. */
  private buildConnectHandlers(opts: {
    definitions: Record<string, IRpcRegistration<RouteEnv>>;
    storage: AsyncLocalStorage<TRouteContext<RouteEnv>>;
  }): Record<string, TConnectHandler> {
    const handlers: Record<string, TConnectHandler> = {};

    for (const name in opts.definitions) {
      const { handler, middlewares } = opts.definitions[name];

      handlers[name] = async (request: unknown, _connectContext: HandlerContext) => {
        const context = opts.storage.getStore();
        if (!context) {
          throw new Error(`[GrpcRequestAdapter] Missing Hono context for RPC "${name}"`);
        }

        // Run pre-built auth middlewares (built by AbstractGrpcController.buildRpcMiddlewares)
        for (const mw of middlewares) {
          await mw(context, async () => {});
        }

        return handler({ request, context });
      };
    }

    return handlers;
  }

  /**
   * Registers a service on a ConnectRouter with a loose signature.
   * Ignis's ServiceType is opaque (unknown) while ConnectRPC expects DescService.
   */
  private registerService(opts: {
    router: ConnectRouter;
    handlers: Record<string, TConnectHandler>;
  }) {
    const { router, handlers } = opts;
    (router.service as Function)(this.controller.service, handlers);
  }

  /** Creates the Hono middleware that dispatches to ConnectRPC universal handlers. */
  private buildMiddleware(opts: {
    handlerMap: Map<string, UniversalHandler>;
    controllerPath: string;
    storage: AsyncLocalStorage<TRouteContext<RouteEnv>>;
  }): MiddlewareHandler<RouteEnv, BasePath, Input> {
    const { handlerMap, controllerPath, storage } = opts;
    const { universalServerRequestFromFetch, universalServerResponseToFetch } = this.protocol;

    return async (context, next) => {
      let pathname = context.req.path;
      if (controllerPath && pathname.startsWith(controllerPath)) {
        pathname = pathname.slice(controllerPath.length) || '/';
      }

      const handler = handlerMap.get(pathname);
      if (!handler) {
        return next();
      }

      return storage.run(context as TRouteContext<RouteEnv>, async () => {
        try {
          const body = await context.req.arrayBuffer();
          const freshRequest = new Request(context.req.url, {
            method: context.req.method,
            headers: context.req.raw.headers,
            body: body.byteLength > 0 ? body : undefined,
          });

          const uReq = universalServerRequestFromFetch(freshRequest, {});
          const uRes = await handler(uReq);
          return universalServerResponseToFetch(uRes);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Internal gRPC error';

          // Preserve gRPC status code from ConnectError (duck-type check avoids peer dep coupling)
          const code =
            typeof (error as any)?.code === 'number'
              ? (error as any).code
              : GRPC.ResultCodes.INTERNAL;

          return new Response(JSON.stringify({ message, code }), {
            status: code === GRPC.ResultCodes.OK ? 200 : HTTP.ResultCodes.RS_5.InternalServerError,
            headers: {
              [HTTP.Headers.CONTENT_TYPE]: HTTP.HeaderValues.APPLICATION_JSON,
              [GRPC.Headers.GRPC_STATUS]: String(code),
              [GRPC.Headers.GRPC_MESSAGE]: encodeURIComponent(message),
            },
          });
        }
      });
    };
  }

  /** Validates peer deps, creates adapter, and returns paths + middleware. */
  static async build<
    RouteEnv extends Env = Env,
    RouteSchema extends Schema = {},
    BasePath extends string = '/',
    ServiceType = Parameters<ConnectRouter['service']>[0],
    ConfigurableOptions extends object = {},
  >(opts: {
    controller: AbstractGrpcController<
      RouteEnv,
      RouteSchema,
      BasePath,
      ServiceType,
      ConfigurableOptions
    >;
    interceptors?: unknown[];
  }): Promise<IConnectAdapterResult<RouteEnv, BasePath>> {
    await validateModule({ modules: CONNECT_RPC_MODULES });

    const adapter = new GrpcRequestAdapter<
      RouteEnv,
      RouteSchema,
      BasePath,
      ServiceType,
      ConfigurableOptions
    >(opts);

    const routerOpts: Record<string, unknown> = {};
    if (adapter.interceptors?.length) {
      routerOpts.interceptors = adapter.interceptors;
    }

    const connectRouter = adapter.createConnectRouter(routerOpts);

    // Per-controller async storage — each concurrent request gets its own isolated context.
    const storage = new AsyncLocalStorage<TRouteContext<RouteEnv>>();

    if (adapter.controller.service) {
      adapter.registerService({
        router: connectRouter,
        handlers: adapter.buildConnectHandlers({
          definitions: adapter.controller.definitions,
          storage,
        }),
      });
    }

    const handlerMap = new Map<string, UniversalHandler>();
    const paths: string[] = [];

    for (const handler of connectRouter.handlers) {
      handlerMap.set(handler.requestPath, handler);
      paths.push(handler.requestPath);
    }

    return {
      paths,
      middleware: adapter.buildMiddleware({
        handlerMap,
        controllerPath: adapter.controller.path,
        storage,
      }),
    };
  }
}
