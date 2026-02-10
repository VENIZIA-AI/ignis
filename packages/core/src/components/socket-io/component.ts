import { BaseApplication, TBunServerInstance } from '@/base/applications';
import { BaseComponent } from '@/base/components';
import { inject } from '@/base/metadata';
import { CoreBindings } from '@/common/bindings';
import { Binding } from '@/helpers/inversion';
import {
  DefaultRedisHelper,
  getError,
  HTTP,
  RuntimeModules,
  SocketIOServerHelper,
  TSocketIOAuthenticateFn,
  TSocketIOClientConnectedFn,
  TSocketIOValidateRoomFn,
  ValueOrPromise,
} from '@venizia/ignis-helpers';
import type { ServerOptions } from 'socket.io';
import {
  SocketIOBindingKeys,
  DEFAULT_SERVER_OPTIONS,
  type IResolvedBindings,
  type IServerOptions,
} from './common';
import { createBunEngine, createBunFetchHandler } from './handlers';
import { createNodeSocketIOHelper } from './handlers';

export class SocketIOComponent extends BaseComponent {
  protected serverOptions: Partial<IServerOptions>;

  constructor(
    @inject({ key: CoreBindings.APPLICATION_INSTANCE }) private application: BaseApplication,
  ) {
    super({
      scope: SocketIOComponent.name,
      initDefault: { enable: true, container: application },
      bindings: {
        [SocketIOBindingKeys.SERVER_OPTIONS]: Binding.bind<Partial<ServerOptions>>({
          key: SocketIOBindingKeys.SERVER_OPTIONS,
        }).toValue(DEFAULT_SERVER_OPTIONS),

        [SocketIOBindingKeys.REDIS_CONNECTION]: Binding.bind<DefaultRedisHelper | null>({
          key: SocketIOBindingKeys.REDIS_CONNECTION,
        }).toValue(null),

        [SocketIOBindingKeys.AUTHENTICATE_HANDLER]: Binding.bind<TSocketIOAuthenticateFn | null>({
          key: SocketIOBindingKeys.AUTHENTICATE_HANDLER,
        }).toValue(null),

        [SocketIOBindingKeys.VALIDATE_ROOM_HANDLER]: Binding.bind<TSocketIOValidateRoomFn | null>({
          key: SocketIOBindingKeys.VALIDATE_ROOM_HANDLER,
        }).toValue(null),

        [SocketIOBindingKeys.CLIENT_CONNECTED_HANDLER]:
          Binding.bind<TSocketIOClientConnectedFn | null>({
            key: SocketIOBindingKeys.CLIENT_CONNECTED_HANDLER,
          }).toValue(null),
      },
    });
  }

  // --------------------------------------------------------------------------
  private resolveBindings(): IResolvedBindings {
    const extraServerOptions =
      this.application.get<Partial<ServerOptions>>({
        key: SocketIOBindingKeys.SERVER_OPTIONS,
        isOptional: true,
      }) ?? {};
    this.serverOptions = Object.assign({}, DEFAULT_SERVER_OPTIONS, extraServerOptions);

    const redisConnection = this.application.get<DefaultRedisHelper>({
      key: SocketIOBindingKeys.REDIS_CONNECTION,
    });
    if (!(redisConnection instanceof DefaultRedisHelper)) {
      throw getError({
        message:
          '[SocketIOComponent][resolveBindings] Invalid instance of redisConnection | Please init connection with RedisHelper for single redis connection or RedisClusterHelper for redis cluster mode!',
      });
    }

    const authenticateFn = this.application.get<TSocketIOAuthenticateFn>({
      key: SocketIOBindingKeys.AUTHENTICATE_HANDLER,
    });
    if (!authenticateFn) {
      throw getError({
        message: '[DANGER][SocketIOComponent] Invalid authenticateFn to setup io socket server!',
      });
    }

    const validateRoomFn =
      this.application.get<TSocketIOValidateRoomFn | null>({
        key: SocketIOBindingKeys.VALIDATE_ROOM_HANDLER,
      }) ?? undefined;

    const clientConnectedFn =
      this.application.get<TSocketIOClientConnectedFn | null>({
        key: SocketIOBindingKeys.CLIENT_CONNECTED_HANDLER,
      }) ?? undefined;

    return { redisConnection, authenticateFn, validateRoomFn, clientConnectedFn };
  }

  // --------------------------------------------------------------------------
  private registerBunHook(opts: IResolvedBindings) {
    const { redisConnection, authenticateFn, validateRoomFn, clientConnectedFn } = opts;
    const serverOptions = this.serverOptions;
    const logger = this.logger.for(this.registerBunHook.name);

    this.application.registerPostStartHook({
      identifier: 'socket-io-initialize',
      hook: async () => {
        const { engine, engineHandler } = await createBunEngine({ serverOptions });

        const socketIOHelper = new SocketIOServerHelper({
          runtime: RuntimeModules.BUN,
          identifier: serverOptions.identifier!,
          engine,
          serverOptions,
          redisConnection,
          authenticateFn,
          validateRoomFn,
          clientConnectedFn,
        });
        await socketIOHelper.configure();

        this.application
          .bind({ key: SocketIOBindingKeys.SOCKET_IO_INSTANCE })
          .toValue(socketIOHelper);

        // Wire engine into the running Bun server via reload
        const serverInstance = this.application.getServerInstance<TBunServerInstance>();
        const honoServer = this.application.getServer();
        const enginePath = serverOptions.path ?? '/socket.io/';

        serverInstance!.reload({
          fetch: createBunFetchHandler({ engine, enginePath, honoServer }),
          websocket: engineHandler.websocket,
        });

        logger.info('SocketIO initialized for Bun runtime');
      },
    });
  }

  // --------------------------------------------------------------------------
  private registerNodeHook(opts: IResolvedBindings) {
    const serverOptions = this.serverOptions;
    const logger = this.logger.for(this.registerNodeHook.name);

    this.application.registerPostStartHook({
      identifier: 'socket-io-initialize',
      hook: async () => {
        const httpServer = this.application.getServerInstance();
        if (!httpServer) {
          throw getError({
            message: '[SocketIOComponent] HTTP server not available for Node.js runtime!',
          });
        }

        const socketIOHelper = await createNodeSocketIOHelper({
          serverOptions,
          httpServer,
          resolvedBindings: opts,
        });

        this.application
          .bind({ key: SocketIOBindingKeys.SOCKET_IO_INSTANCE })
          .toValue(socketIOHelper);

        logger.info('SocketIO initialized for Node.js runtime');
      },
    });
  }

  // --------------------------------------------------------------------------
  override binding(): ValueOrPromise<void> {
    const logger = this.logger.for(this.binding.name);

    if (!this.application) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
        message: '[binding] Invalid application to bind SocketIOComponent',
      });
    }

    logger.info('Binding SocketIO for application...');

    const resolved = this.resolveBindings();
    logger.debug('Socket.IO Server Options: %j', this.serverOptions);

    const runtime = RuntimeModules.detect();

    switch (runtime) {
      case RuntimeModules.BUN: {
        this.registerBunHook(resolved);
        break;
      }
      case RuntimeModules.NODE: {
        this.registerNodeHook(resolved);
        break;
      }
      default: {
        throw getError({ message: `[SocketIOComponent] Unsupported runtime: ${runtime}` });
      }
    }
  }
}
