import { ControllerTransports } from '@/base/controllers/common/constants';
import { IRpcMetadata } from '@/helpers/inversion/common/types';
import { MetadataRegistry } from '@/helpers/inversion/registry';
import type { ConnectRouter } from '@connectrpc/connect';
import { OpenAPIHono } from '@hono/zod-openapi';
import { BaseHelper, getError, ValueOrPromise } from '@venizia/ignis-helpers';
import { Env, Schema } from 'hono';
import { GrpcRequestAdapter } from './adapter';
import {
  IGrpcBindRouteOptions,
  IGrpcController,
  IGrpcControllerOptions,
  IGrpcDefineRouteOptions,
  IRpcRegistration,
  TRpcHandler,
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
  router: OpenAPIHono<RouteEnv, RouteSchema, BasePath>;

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

    this.router = new OpenAPIHono<RouteEnv, RouteSchema, BasePath>({
      strict: true,
      defaultHook: (result, _context) => {
        if (!result.success) {
          throw result.error;
        }
      },
    });

    if (decoratorMetadata?.transport === ControllerTransports.GRPC && decoratorMetadata.service) {
      this.service = decoratorMetadata.service as ServiceType;
    } else {
      this.service = undefined as unknown as ServiceType;
    }
  }

  /** Returns the per-controller sub-router. */
  getRouter() {
    return this.router;
  }

  /** Processes RPC config (symmetric with REST's getRouteConfigs). Returns configs as-is for now. */
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
      const handler = (this as any)[methodName];
      if (typeof handler !== 'function') {
        logger.warn('RPC method "%s" not found on controller', String(methodName));
        continue;
      }

      const configs = this.getRouteConfigs({ configs: rpcMetadata });

      this.bindRoute({ configs }).to({ handler: handler.bind(this) });

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

    // Create per-controller adapter middleware and mount on this.router
    const adapter = await GrpcRequestAdapter.build({ controller: this });
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
