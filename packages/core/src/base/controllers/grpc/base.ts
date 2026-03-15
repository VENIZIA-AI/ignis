import { IRpcMetadata } from '@/helpers/inversion/common/types';
import { getError, GRPC } from '@venizia/ignis-helpers';
import { Env, Schema } from 'hono';
import { AbstractGrpcController } from './abstract';
import { IGrpcBindRouteOptions, IGrpcDefineRouteOptions, TRpcHandler } from './common/types';

/** Recommended base class for gRPC controllers with concrete bindRoute and defineRoute implementations. */
export abstract class BaseGrpcController<
  RouteEnv extends Env = Env,
  RouteSchema extends Schema = {},
  BasePath extends string = '/',
  ServiceType = unknown,
  ConfigurableOptions extends object = {},
> extends AbstractGrpcController<
  RouteEnv,
  RouteSchema,
  BasePath,
  ServiceType,
  ConfigurableOptions
> {
  /** Creates a fluent binding for registering an RPC (call .to() to attach handler). */
  bindRoute(opts: { configs: IRpcMetadata }): IGrpcBindRouteOptions<RouteEnv> {
    const configs = this.getRouteConfigs({ configs: opts.configs });

    return {
      configs,
      to: ({ handler }) => {
        this.registerRoute({ configs, handler });
        return { configs };
      },
    };
  }

  /** Defines and registers an RPC with its handler in a single call. */
  defineRoute(opts: {
    configs: IRpcMetadata;
    handler: TRpcHandler<unknown, unknown, RouteEnv>;
  }): IGrpcDefineRouteOptions {
    const configs = this.getRouteConfigs({ configs: opts.configs });
    this.registerRoute({ configs, handler: opts.handler });
    return { configs };
  }

  /** Internal: validates and stores handler + configs in definitions. Throws on non-unary methods. */
  private registerRoute(opts: {
    configs: IRpcMetadata;
    handler: TRpcHandler<unknown, unknown, RouteEnv>;
  }): void {
    const { configs, handler } = opts;
    const logger = this.logger.for('registerRoute');

    if (configs.method !== GRPC.Methods.UNARY) {
      throw getError({
        message: `[${this.constructor.name}] RPC method "${configs.name}" uses "${configs.method}" which is not supported. Only unary RPCs are supported in the current version (HTTP/1.1 Connect protocol).`,
      });
    }

    if (this.definitions[configs.name]) {
      logger.warn('Overwriting RPC handler | name: %s', configs.name);
    }

    const middlewares = this.buildRpcMiddlewares({ configs });
    this.definitions[configs.name] = { configs, handler, middlewares };
    logger.debug('Registered RPC | name: %s | method: %s', configs.name, configs.method);
  }
}
