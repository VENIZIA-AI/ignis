import { ControllerTransports } from '@venizia/ignis-kernel';
import { AuthenticationModes } from '@venizia/ignis-kernel';
import { authenticate as authenticateFn } from '@venizia/ignis-kernel';
import type { IAuthorizationSpec } from '@venizia/ignis-kernel';
import { authorize as authorizeFn } from '@venizia/ignis-kernel';
import type { IRpcMetadata } from '@venizia/ignis-kernel';
import { MetadataRegistry } from '@venizia/ignis-kernel';
import type { ConnectRouter } from '@connectrpc/connect';
import type { ValueOrPromise } from '@venizia/ignis-helpers/common';
import { BaseHelper, getError } from '@venizia/ignis-helpers/core';
import type { Env, Schema } from 'hono';
import { Hono } from 'hono';
import { GrpcRequestAdapter } from './adapter';
import type {
  IConnectRpcModule,
  IGrpcBindRouteOptions,
  IGrpcController,
  IGrpcControllerOptions,
  IGrpcDefineRouteOptions,
  IRpcRegistration,
  TRpcHandler,
  TRpcMiddleware,
} from './common/types';

/** Abstract base class for gRPC controllers, providing RPC registration and ConnectRPC integration. */
export abstract class AbstractGrpcController<
  RouteEnv extends Env = Env,
  RouteSchema extends Schema = {},
  BasePath extends string = '/',
  ServiceType = Parameters<ConnectRouter['service']>[0],
  ConfigurableOptions extends object = {},
>
  extends BaseHelper
  implements IGrpcController<RouteEnv, RouteSchema, BasePath, ServiceType, ConfigurableOptions>
{
  isConfigured = false;

  definitions: Record<string, IRpcRegistration<RouteEnv>> = {};

  /** ConnectRPC service definition from @controller metadata. */
  service: ServiceType;
  path: string;
  basePath: string = '';
  /** Assigned by GrpcComponent from its options, before configure(). Absent means the adapter resolves the peer itself. */
  connectRpcModule?: IConnectRpcModule;
  /** ConnectRPC interceptors, assigned by GrpcComponent from its options before configure(). Applied to every RPC this controller registers. */
  interceptors?: unknown[];
  router: Hono<RouteEnv, RouteSchema, BasePath>;

  constructor(opts: IGrpcControllerOptions) {
    super(opts);

    const decoratorMetadata = MetadataRegistry.getInstance().getControllerMetadata({
      target: new.target,
    });

    const resolvedPath = decoratorMetadata?.path ?? opts.path;

    if (!resolvedPath) {
      throw getError({
        message: `[${new.target.name}] Controller path is required. Provide path via @controller decorator or constructor options.`,
      });
    }

    this.path = resolvedPath;

    this.router = new Hono<RouteEnv, RouteSchema, BasePath>();

    if (decoratorMetadata?.transport === ControllerTransports.GRPC && decoratorMetadata.service) {
      // Decorator metadata stores `service` as `unknown`; ServiceType is this class's own generic, resolved only by convention at the decorator site.
      this.service = decoratorMetadata.service as ServiceType;
    } else {
      // ServiceType is unconstrained (no `extends` bound), so `undefined` cannot be proven to overlap it - this is the "not yet resolved" sentinel until binding() configures it.
      this.service = undefined as ServiceType;
    }
  }

  /** Returns the per-controller sub-router. */
  getRouter() {
    return this.router;
  }

  /** Builds pre-built auth middleware from RPC config (symmetric with REST's buildRouteMiddlewares). */
  buildRpcMiddlewares(opts: { configs: IRpcMetadata }): TRpcMiddleware<RouteEnv>[] {
    const { configs } = opts;
    const mws: TRpcMiddleware<RouteEnv>[] = [];

    if (configs.authenticate) {
      const { strategies = [], mode = AuthenticationModes.ANY } = configs.authenticate;
      if (strategies.length > 0) {
        const authMw = authenticateFn({ strategies, mode });

        // authMw is a Hono MiddlewareHandler built for raw Context<Env>; TRouteContext is a lightweight custom shape (different `json`/`req.valid` signatures), not a subtype - genuinely different context types bridged here.
        mws.push((context, next) => authMw(context as any, next));
      }
    }

    // Inject authorize middleware AFTER authenticate
    if (configs.authorize) {
      const specs: IAuthorizationSpec[] = Array.isArray(configs.authorize)
        ? configs.authorize
        : [configs.authorize];
      for (const spec of specs) {
        const authzMw = authorizeFn({ spec });
        // Same TRouteContext-vs-Context<Env> bridge as authMw above.
        mws.push((context, next) => authzMw(context as any, next));
      }
    }

    return mws;
  }

  /** Processes RPC config (symmetric with REST's getRouteConfigs). Returns configs as-is. */
  getRouteConfigs(opts: { configs: IRpcMetadata }): IRpcMetadata {
    return opts.configs;
  }

  /** Registers RPC methods defined via @rpc/@unary/@serverStream/etc. decorators from the metadata registry. */
  registerRpcsFromRegistry(): void {
    const rpcs = MetadataRegistry.getInstance().getRpcs({
      target: Object.getPrototypeOf(this),
    });

    if (!rpcs?.size) {
      return;
    }

    const logger = this.logger.for(this.registerRpcsFromRegistry.name);

    for (const [methodName, rpcMetadata] of rpcs) {
      // Dynamic dispatch by decorator-recorded method name - the controller class has no static index signature, so this read cannot be typed narrower than `unknown`.
      const handler = (this as Record<string | symbol, unknown>)[methodName];
      if (typeof handler !== 'function') {
        logger.warn('RPC method "%s" not found on controller', String(methodName));
        continue;
      }

      const configs = this.getRouteConfigs({ configs: rpcMetadata });

      this.bindRoute({ configs }).to({
        handler: (handler as TRpcHandler<unknown, unknown, RouteEnv>).bind(this),
      });

      logger.debug(
        'Registered RPC | name: %s | method: %s | type: %s',
        rpcMetadata.name,
        String(methodName),
        rpcMetadata.method,
      );
    }
  }

  /** Configures the controller by binding all RPCs, registering decorator-based RPCs, and mounting the adapter. Idempotent. */
  async configure(opts?: ConfigurableOptions): Promise<void> {
    if (this.isConfigured) {
      return;
    }

    const t = performance.now();
    const logger = this.logger.for(this.configure.name);

    logger.info('START | Binding gRPC controller | Options: %j', opts ?? {});

    await this.binding();
    this.registerRpcsFromRegistry();

    const adapter = await GrpcRequestAdapter.build({
      controller: this,
      module: this.connectRpcModule,
      interceptors: this.interceptors,
    });
    this.router.use('*', adapter.middleware);

    if (adapter.paths.length > 0) {
      logger.debug('Adapter paths: %j', adapter.paths);
    }

    this.isConfigured = true;
    logger.info('DONE | Binding gRPC controller | Took: %s (ms)', performance.now() - t);
  }

  /** Override to register RPCs using bindRoute or defineRoute. */
  abstract binding(): ValueOrPromise<void>;

  /** Creates a fluent binding for registering an RPC (call .to() to attach handler). */
  abstract bindRoute(opts: { configs: IRpcMetadata }): IGrpcBindRouteOptions<RouteEnv>;

  /** Defines and registers an RPC with its handler in a single call. */
  abstract defineRoute(opts: {
    configs: IRpcMetadata;
    handler: TRpcHandler<unknown, unknown, RouteEnv>;
  }): IGrpcDefineRouteOptions;
}
