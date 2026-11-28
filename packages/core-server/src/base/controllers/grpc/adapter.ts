import type { ConnectRouter, ContextKey, HandlerContext } from '@connectrpc/connect';
import type { UniversalHandler } from '@connectrpc/connect/protocol';
import { BaseHelper, getError, RecordUtility } from '@venizia/ignis-helpers/core';
import { GRPC, HTTP, type ValueOrPromise } from '@venizia/ignis-helpers/common';
import { ModuleUtility } from '@venizia/ignis-helpers';
import type { Context, Env, Schema } from 'hono';
import { Hono } from 'hono';
import { BodyLimits, type TRouteContext } from '@venizia/ignis-kernel';
import type { AbstractGrpcController } from './abstract';
import { GrpcErrors } from './errors';
import { GrpcTimeoutGuard } from './timeout.guard';
import { GrpcNativeCallStore } from './native/call.store';
import type { IConnectNodeModule } from './native/common/types';
import { GrpcNativeWriter } from './native/native.writer';
import { AppErrorMiddleware } from '@/base/middlewares/app-error/app-error.middleware';
import type {
  IConnectAdapterResult,
  IConnectRpcModule,
  IGrpcLimits,
  IGrpcNativeAdapterOptions,
  IRpcRegistration,
  TRpcMiddleware,
} from './common/types';

const CONNECT_RPC_MODULES = ['@connectrpc/connect'];
const CONNECT_RPC_PROTOCOL_MODULE = '@connectrpc/connect/protocol';
const CONNECT_RPC_NODE_MODULE = '@connectrpc/connect-node';

type TConnectHandler<RequestType = unknown, ResponseType = unknown> = (
  request: RequestType,
  context: HandlerContext,
) => ValueOrPromise<ResponseType> | AsyncIterable<ResponseType>;

/** One call of one RPC. */
interface IRpcCall<RouteEnv extends Env> {
  name: string;
  definition: IRpcRegistration<RouteEnv>;
  rpc: HandlerContext;
}

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
  /** Set when the native gRPC port is on: handlers of the gRPC protocol are built too. */
  native?: IGrpcNativeAdapterOptions;
  /** The server's `idleTimeout` in seconds, given back to a connection when a call ends. */
  idleTimeout?: number;
}

/**
 * Bridges IGNIS gRPC controllers with ConnectRPC: loads the peer deps with `ModuleUtility.load` (the ES module copy an
 * application's own import gets) and registers one Hono route per RPC, which hands the request to ConnectRPC's handler
 * with the Hono context in its context values. That route serves Connect and gRPC-Web; with the native port on, it
 * also writes a native gRPC call on the node stream, which can send the response trailers `Bun.serve` cannot.
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
  private static async loadModule(opts: { isNative: boolean }): Promise<IConnectRpcModule> {
    const modules = opts.isNative
      ? [...CONNECT_RPC_MODULES, CONNECT_RPC_NODE_MODULE]
      : CONNECT_RPC_MODULES;
    ModuleUtility.assertInstalled({ modules, allowRegistered: true });

    const [connect, protocol] = await Promise.all([
      ModuleUtility.load<IConnectRpcModule['connect']>({ module: CONNECT_RPC_MODULES[0] }),
      ModuleUtility.load<IConnectRpcModule['protocol']>({ module: CONNECT_RPC_PROTOCOL_MODULE }),
    ]);

    if (!opts.isNative) {
      return { connect, protocol };
    }

    const node = await ModuleUtility.load<IConnectNodeModule>({ module: CONNECT_RPC_NODE_MODULE });

    return { connect, protocol, node };
  }

  /**
   * One RPC in the shape ConnectRPC calls: a call that streams its answer is a generator, the others answer a promise.
   * The middlewares run first, then the handler; a throw becomes the answer a gRPC client reads.
   */
  private wrap(opts: { name: string; definition: IRpcRegistration<RouteEnv> }): TConnectHandler {
    const { name, definition } = opts;
    const { method } = definition.configs;

    if (method === GRPC.Methods.SERVER_STREAMING || method === GRPC.Methods.BIDI_STREAMING) {
      return (request: unknown, rpc: HandlerContext) =>
        this.stream({ name, definition, request, rpc });
    }

    return async (request: unknown, rpc: HandlerContext) => {
      try {
        const context = await this.open({ name, definition, rpc });
        const response = await definition.handler({ request, context, rpc });

        return response;
      } catch (error) {
        const answer = await this.toAnswer({ error, rpc });
        throw answer;
      } finally {
        this.close({ name, definition, rpc });
      }
    };
  }

  /** A call that streams its answer: the handler's messages, one by one. */
  private async *stream(opts: IRpcCall<RouteEnv> & { request: unknown }) {
    const { name, definition, request, rpc } = opts;

    try {
      const context = await this.open({ name, definition, rpc });
      const messages: unknown = await definition.handler({ request, context, rpc });

      if (!this.isMessageStream(messages)) {
        throw getError({
          message: `[GrpcRequestAdapter] RPC "${name}" streams its answer: the handler must return an async iterable, such as an async generator`,
        });
      }

      yield* messages;
    } catch (error) {
      const answer = await this.toAnswer({ error, rpc });
      throw answer;
    } finally {
      this.close({ name, definition, rpc });
    }
  }

  private isMessageStream(value: unknown): value is AsyncIterable<unknown> {
    return typeof value === 'object' && value !== null && Symbol.asyncIterator in value;
  }

  /** The Hono context of the call. */
  private readContext(opts: { rpc: HandlerContext }): Context<RouteEnv> {
    const context = opts.rpc.values.get(this.honoContext);

    if (!context) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
        message: `[GrpcRequestAdapter] Missing Hono context for RPC "${opts.rpc.method.name}"`,
      });
    }

    return context;
  }

  /** Runs the middlewares of a call and answers the context its handler reads. A call that passed one may stay quiet. */
  private async open(opts: IRpcCall<RouteEnv>) {
    const { definition, rpc } = opts;
    const honoContext = this.readContext({ rpc });
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- Hono's context is what runs; `TRouteContext` is built on it but declares `json` and `req.valid` differently, so it is no subtype
    const context = honoContext as TRouteContext<RouteEnv>;

    await this.passMiddlewares({ context, middlewares: definition.middlewares });

    // Only after the middlewares: a caller with no credentials keeps the idle timeout, and so does a public method.
    if (definition.middlewares.length > 0) {
      GrpcTimeoutGuard.lift({ context: honoContext });
    }

    return context;
  }

  /** The end of a call, before its response ends: a connection whose idle timeout was lifted gets it back. */
  private close(opts: IRpcCall<RouteEnv>) {
    if (opts.definition.middlewares.length === 0) {
      return;
    }

    GrpcTimeoutGuard.restore({
      context: this.readContext({ rpc: opts.rpc }),
      seconds: this.options.idleTimeout ?? GrpcTimeoutGuard.DEFAULT_IDLE_TIMEOUT_SECONDS,
    });
  }

  private async toAnswer(opts: { error: unknown; rpc: HandlerContext }) {
    const answer = await GrpcErrors.toAnswer({
      error: opts.error,
      context: this.readContext({ rpc: opts.rpc }),
      connect: this.peers.connect,
      handle: this.handleError,
    });

    return answer;
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

  /**
   * ConnectRPC drops a handler whose name the service does not declare, and a handler of another kind than the service's
   * fails only when called: both are refused at boot.
   */
  private assertDeclaredRpcs() {
    const service: unknown = this.options.controller.service;

    if (
      !RecordUtility.isRecord(service) ||
      !('methods' in service) ||
      !Array.isArray(service.methods)
    ) {
      return;
    }

    const kinds = new Map(
      service.methods.map((method: unknown) => {
        const described = RecordUtility.isRecord(method) ? method : {};

        return [String(described.localName ?? ''), described.methodKind];
      }),
    );
    const { constructor, definitions } = this.options.controller;

    for (const [name, definition] of Object.entries(definitions)) {
      if (!kinds.has(name)) {
        throw getError({
          message: `[${constructor.name}] ${String(service.typeName)} declares no RPC "${name}" | declared: ${[...kinds.keys()].join(', ')}`,
        });
      }

      const kind = kinds.get(name);
      const { method } = definition.configs;

      // A hand-written descriptor may carry no kind: there is nothing to hold the declaration to.
      if (typeof kind === 'string' && kind !== method) {
        throw getError({
          message: `[${constructor.name}] ${String(service.typeName)}.${name} is ${kind}, declared ${method} | declare it with ${this.decoratorOf({ kind })} or method "${kind}"`,
        });
      }
    }
  }

  private decoratorOf(opts: { kind: string }) {
    const decorators = new Map<string, string>([
      [GRPC.Methods.UNARY, '@unary'],
      [GRPC.Methods.SERVER_STREAMING, '@serverStream'],
      [GRPC.Methods.CLIENT_STREAMING, '@clientStream'],
      [GRPC.Methods.BIDI_STREAMING, '@bidiStream'],
    ]);

    return decorators.get(opts.kind) ?? '@rpc';
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

  /** The signal of the native handlers: it aborts with the listener's, carrying what the client should read. */
  private toShutdownSignal(opts: { signal: AbortSignal }) {
    const shutdown = new AbortController();
    opts.signal.addEventListener('abort', () => {
      shutdown.abort(GrpcErrors.shuttingDown({ connect: this.peers.connect }));
    });

    return shutdown.signal;
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
   * earlier middleware set are kept. A call of the native gRPC port is written on its node stream instead. A failure
   * outside ConnectRPC reaches the application's error handler.
   */
  private async serve(opts: {
    context: Context<RouteEnv>;
    handler: UniversalHandler;
    nativeHandler?: UniversalHandler;
  }) {
    const { context, handler, nativeHandler } = opts;
    const call = GrpcNativeCallStore.read({ env: context.env });
    const { node } = this.peers;
    const contextValues = this.peers.connect.createContextValues().set(this.honoContext, context);

    if (call && nativeHandler && node) {
      await GrpcNativeWriter.answer({
        call,
        handler: nativeHandler,
        contextValues,
        headers: context.newResponse(null).headers,
        node,
      });

      // The answer is on the stream: this one only ends the middleware chain.
      return context.body(null);
    }

    const request = await this.readRequest({ context });

    const universalRequest = this.peers.protocol.universalServerRequestFromFetch(request, {
      httpVersion: '1.1',
    });
    const universalResponse = await handler({ ...universalRequest, contextValues });
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

    const isNative = opts.native !== undefined;
    let peers = opts.module;

    if (!peers) {
      const loaded = await GrpcRequestAdapter.loadModule({ isNative });
      peers = loaded;
    }

    if (isNative && !peers.node) {
      throw getError({
        message: `[${opts.controller.constructor.name}] The native gRPC port needs ${CONNECT_RPC_NODE_MODULE}: pass it as module.node`,
      });
    }

    const adapter = new GrpcRequestAdapter(opts, peers);

    // `Bun.serve` sends no response trailers, so the gRPC protocol is off here.
    // ConnectRPC's own default accepts a message of 4 GiB.
    const routerOpts: Record<string, unknown> = { grpc: false, readMaxBytes: messageSize };

    if (opts.interceptors?.length) {
      routerOpts.interceptors = opts.interceptors;
    }

    const connectRouter = peers.connect.createConnectRouter(routerOpts);
    const nativeRouter =
      opts.native &&
      peers.connect.createConnectRouter({
        ...routerOpts,
        grpc: true,
        connect: false,
        grpcWeb: false,
        shutdownSignal: adapter.toShutdownSignal({ signal: opts.native.shutdownSignal }),
      });

    if (opts.controller.service) {
      adapter.assertDeclaredRpcs();
      adapter.registerService({ router: connectRouter });

      if (nativeRouter) {
        adapter.registerService({ router: nativeRouter });
      }
    }

    const nativeHandlers = new Map(
      nativeRouter?.handlers.map((handler) => [handler.requestPath, handler]),
    );

    const router = new Hono<RouteEnv>();
    const paths: string[] = [];

    for (const handler of connectRouter.handlers) {
      paths.push(handler.requestPath);
      router.on(
        handler.allowedMethods,
        handler.requestPath,
        BodyLimits.stream(),
        (context: Context<RouteEnv>) =>
          adapter.serve({
            context,
            handler,
            nativeHandler: nativeHandlers.get(handler.requestPath),
          }),
      );
    }

    return { paths, router };
  }
}
