import type { ConnectRouter, ContextKey, HandlerContext } from '@connectrpc/connect';
import type { UniversalHandler } from '@connectrpc/connect/protocol';
import type { ValueOrPromise } from '@venizia/ignis-helpers/common';
import { BaseHelper, getError, RecordUtility } from '@venizia/ignis-helpers/core';
import { HTTP } from '@venizia/ignis-helpers/common';
import { ModuleUtility } from '@venizia/ignis-helpers';
import type { Context, Env, Schema } from 'hono';
import { Hono } from 'hono';
import { BodyLimits } from '@venizia/ignis-kernel';
import type { TRouteContext } from '@venizia/ignis-kernel';
import type { AbstractGrpcController } from './abstract';
import { GrpcErrors } from './errors';
import { AppErrorMiddleware } from '@/base/middlewares/app-error/app-error.middleware';
import type {
  IConnectAdapterResult,
  IConnectRpcModule,
  IGrpcLimits,
  IRpcRegistration,
  TRpcMiddleware,
} from './common/types';

const CONNECT_RPC_MODULES = ['@connectrpc/connect'];
const CONNECT_RPC_PROTOCOL_MODULE = '@connectrpc/connect/protocol';

type TConnectHandler<RequestType = unknown, ResponseType = unknown> = (
  request: RequestType,
  context: HandlerContext,
) => ValueOrPromise<ResponseType>;

/** What an adapter is built from. */
interface IAdapterOptions<
  RouteEnv extends Env,
  RouteSchema extends Schema,
  BasePath extends string,
  ServiceType,
  ConfigurableOptions extends object,
> {
  controller: AbstractGrpcController<
    RouteEnv,
    RouteSchema,
    BasePath,
    ServiceType,
    ConfigurableOptions
  >;
  interceptors?: unknown[];
  module?: IConnectRpcModule;
  limits?: IGrpcLimits;
}

/**
 * Bridges IGNIS gRPC controllers with ConnectRPC: loads the peer deps with `ModuleUtility.load` (the ES module copy an
 * application's own import gets) and registers one Hono route per RPC, which hands the request to ConnectRPC's handler
 * with the Hono context in its context values. Connect and gRPC-Web only: native gRPC needs response trailers.
 */
export class GrpcRequestAdapter<
  RouteEnv extends Env = Env,
  RouteSchema extends Schema = {},
  BasePath extends string = '/',
  ServiceType = Parameters<ConnectRouter['service']>[0],
  ConfigurableOptions extends object = {},
> extends BaseHelper {
  /** The Hono context of the call, as ConnectRPC carries it to the RPC handler. */
  private readonly honoContext: ContextKey<Context<RouteEnv> | undefined>;
  /** The server's default error handler: it decides the status and the message a client may read, and logs the error. */
  private readonly handleError = new AppErrorMiddleware().value();

  private constructor(
    private readonly options: IAdapterOptions<
      RouteEnv,
      RouteSchema,
      BasePath,
      ServiceType,
      ConfigurableOptions
    >,
    private readonly peers: IConnectRpcModule,
  ) {
    super({ scope: GrpcRequestAdapter.name });

    this.honoContext = peers.connect.createContextKey<Context<RouteEnv> | undefined>(undefined);
  }

  /**
   * The ConnectRPC peers, loaded as ES modules from the project root (or taken from `ModuleUtility.register`,
   * which is what a compiled binary has). A missing peer rejects with the error that names what to install.
   */
  private static async loadModule(): Promise<IConnectRpcModule> {
    ModuleUtility.assertInstalled({ modules: CONNECT_RPC_MODULES, allowRegistered: true });

    const [connect, protocol] = await Promise.all([
      ModuleUtility.load<IConnectRpcModule['connect']>({ module: CONNECT_RPC_MODULES[0] }),
      ModuleUtility.load<IConnectRpcModule['protocol']>({ module: CONNECT_RPC_PROTOCOL_MODULE }),
    ]);

    return { connect, protocol };
  }

  /** One RPC: the middlewares, then the handler; a throw becomes the answer a gRPC client reads. */
  private wrap(opts: { name: string; definition: IRpcRegistration<RouteEnv> }): TConnectHandler {
    const { name, definition } = opts;
    const { handler, middlewares } = definition;

    return async (request: unknown, rpc: HandlerContext) => {
      const requestContext = rpc.values.get(this.honoContext);

      if (!requestContext) {
        throw getError({
          statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
          message: `[GrpcRequestAdapter] Missing Hono context for RPC "${name}"`,
        });
      }

      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- Hono's context is what runs; `TRouteContext` is built on it but declares `json` and `req.valid` differently, so it is no subtype
      const context = requestContext as TRouteContext<RouteEnv>;

      try {
        await this.passMiddlewares({ context, middlewares });

        const response = await handler({ request, context, rpc });

        return response;
      } catch (error) {
        const answer = await GrpcErrors.toAnswer({
          error,
          context: requestContext,
          connect: this.peers.connect,
          handle: this.handleError,
        });
        throw answer;
      }
    };
  }

  /**
   * Runs the pre-built auth middlewares (`AbstractGrpcController.buildRpcMiddlewares`) in order. Each one must call
   * `next()` to pass the call on; one that answers, or does neither, ends it.
   */
  private async passMiddlewares(opts: {
    context: TRouteContext<RouteEnv>;
    middlewares: Array<TRpcMiddleware<RouteEnv>>;
  }) {
    const { context, middlewares } = opts;

    for (const middleware of middlewares) {
      let isPassed = false;
      const answer = await middleware(context, async () => {
        isPassed = true;
      });

      if (answer instanceof Response) {
        throw GrpcErrors.endedByMiddleware({ status: answer.status });
      }

      if (!isPassed) {
        throw GrpcErrors.notPassed();
      }
    }
  }

  /** ConnectRPC drops a handler whose name the service does not declare, and the call then answers `unimplemented`: refused at boot instead. */
  private assertDeclaredRpcs() {
    const service: unknown = this.options.controller.service;

    if (
      !RecordUtility.isRecord(service) ||
      !('methods' in service) ||
      !Array.isArray(service.methods)
    ) {
      return;
    }

    const declared = service.methods.map((method: unknown) =>
      RecordUtility.isRecord(method) ? String(method.localName) : '',
    );
    const unknownName = Object.keys(this.options.controller.definitions).find(
      (name) => !declared.includes(name),
    );

    if (unknownName !== undefined) {
      throw getError({
        message: `[${this.options.controller.constructor.name}] ${String(service.typeName)} declares no RPC "${unknownName}" | declared: ${declared.join(', ')}`,
      });
    }
  }

  /** Registers every RPC of the controller on the ConnectRPC router, each wrapped into ConnectRPC's `(request, context) => response`. */
  private registerService(opts: { router: ConnectRouter }) {
    const { service, definitions } = this.options.controller;
    const handlers = Object.fromEntries(
      Object.entries(definitions).map(([name, definition]) => [
        name,
        this.wrap({ name, definition }),
      ]),
    );

    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- `router.service` takes a ConnectRPC `DescService`, while the controller's `ServiceType` is unbounded
    (opts.router.service as Function)(service, handlers);
  }

  /** The request ConnectRPC reads. A body an earlier middleware consumed is in Hono's cache: the request is rebuilt with it. */
  private async readRequest(opts: { context: Context<RouteEnv> }) {
    const { raw } = opts.context.req;

    if (!raw.bodyUsed) {
      return raw;
    }

    const body = await opts.context.req.arrayBuffer();

    return new Request(raw.url, {
      method: raw.method,
      headers: raw.headers,
      body,
      signal: raw.signal,
    });
  }

  /**
   * One request of one RPC: handed to ConnectRPC's handler, answered through `context.newResponse` so the headers
   * earlier middleware set are kept. A failure outside ConnectRPC reaches the application's error handler.
   */
  private async serve(opts: { context: Context<RouteEnv>; handler: UniversalHandler }) {
    const { context, handler } = opts;
    const request = await this.readRequest({ context });

    const universalRequest = this.peers.protocol.universalServerRequestFromFetch(request, {
      httpVersion: '1.1',
    });
    const universalResponse = await handler({
      ...universalRequest,
      contextValues: this.peers.connect.createContextValues().set(this.honoContext, context),
    });
    const response = this.peers.protocol.universalServerResponseToFetch(universalResponse);

    return context.newResponse(response.body, response);
  }

  /** Validates peer deps and builds the controller's router: one route per RPC of its service. */
  static async build<
    RouteEnv extends Env = Env,
    RouteSchema extends Schema = {},
    BasePath extends string = '/',
    ServiceType = Parameters<ConnectRouter['service']>[0],
    ConfigurableOptions extends object = {},
  >(
    opts: IAdapterOptions<RouteEnv, RouteSchema, BasePath, ServiceType, ConfigurableOptions>,
  ): Promise<IConnectAdapterResult<RouteEnv>> {
    const messageSize = opts.limits?.messageSize ?? BodyLimits.DEFAULT_MAX_SIZE;

    if (!Number.isInteger(messageSize) || messageSize <= 0) {
      throw getError({
        message: `[${opts.controller.constructor.name}] limits.messageSize must be a positive integer of bytes | value: ${String(messageSize)}`,
      });
    }

    let peers = opts.module;

    if (!peers) {
      const loaded = await GrpcRequestAdapter.loadModule();
      peers = loaded;
    }

    const adapter = new GrpcRequestAdapter(opts, peers);

    // `Bun.serve` sends no response trailers, so the gRPC protocol is off here.
    // ConnectRPC's own default accepts a message of 4 GiB.
    const routerOpts: Record<string, unknown> = { grpc: false, readMaxBytes: messageSize };

    if (opts.interceptors?.length) {
      routerOpts.interceptors = opts.interceptors;
    }

    const connectRouter = peers.connect.createConnectRouter(routerOpts);

    if (opts.controller.service) {
      adapter.assertDeclaredRpcs();
      adapter.registerService({ router: connectRouter });
    }

    const router = new Hono<RouteEnv>();
    const paths: string[] = [];

    for (const handler of connectRouter.handlers) {
      paths.push(handler.requestPath);
      router.on(
        handler.allowedMethods,
        handler.requestPath,
        BodyLimits.stream(),
        (context: Context<RouteEnv>) => adapter.serve({ context, handler }),
      );
    }

    return { paths, router };
  }
}
