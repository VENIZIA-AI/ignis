import { BaseApplication, TBunServerInstance } from '@/base/applications';
import { BaseComponent } from '@/base/components';
import { inject } from '@/base/metadata';
import { CoreBindings } from '@/common/bindings';
import { Binding } from '@/helpers/inversion';
import {
  DefaultRedisHelper,
  getError,
  HTTP,
  IWebSocketServerOptions,
  RuntimeModules,
  TWebSocketAuthenticateFn,
  TWebSocketClientConnectedFn,
  TWebSocketClientDisconnectedFn,
  TWebSocketMessageHandler,
  TWebSocketHandshakeFn,
  TWebSocketOutboundTransformer,
  TWebSocketValidateRoomFn,
  ValueOrPromise,
  WebSocketDefaults,
  WebSocketServerHelper,
} from '@venizia/ignis-helpers';
import {
  WebSocketBindingKeys,
  DEFAULT_SERVER_OPTIONS,
  type IResolvedBindings,
  type IServerOptions,
} from './common';
import { createBunFetchHandler } from './handlers';

export class WebSocketComponent extends BaseComponent {
  protected serverOptions: IServerOptions;

  constructor(
    @inject({ key: CoreBindings.APPLICATION_INSTANCE }) private application: BaseApplication,
  ) {
    super({
      scope: WebSocketComponent.name,
      initDefault: { enable: true, container: application },
      bindings: {
        [WebSocketBindingKeys.SERVER_OPTIONS]: Binding.bind<Partial<IServerOptions>>({
          key: WebSocketBindingKeys.SERVER_OPTIONS,
        }).toValue(DEFAULT_SERVER_OPTIONS),

        [WebSocketBindingKeys.REDIS_CONNECTION]: Binding.bind<DefaultRedisHelper | null>({
          key: WebSocketBindingKeys.REDIS_CONNECTION,
        }).toValue(null),

        [WebSocketBindingKeys.AUTHENTICATE_HANDLER]: Binding.bind<TWebSocketAuthenticateFn | null>({
          key: WebSocketBindingKeys.AUTHENTICATE_HANDLER,
        }).toValue(null),

        [WebSocketBindingKeys.VALIDATE_ROOM_HANDLER]: Binding.bind<TWebSocketValidateRoomFn | null>(
          {
            key: WebSocketBindingKeys.VALIDATE_ROOM_HANDLER,
          },
        ).toValue(null),

        [WebSocketBindingKeys.CLIENT_CONNECTED_HANDLER]:
          Binding.bind<TWebSocketClientConnectedFn | null>({
            key: WebSocketBindingKeys.CLIENT_CONNECTED_HANDLER,
          }).toValue(null),

        [WebSocketBindingKeys.CLIENT_DISCONNECTED_HANDLER]:
          Binding.bind<TWebSocketClientDisconnectedFn | null>({
            key: WebSocketBindingKeys.CLIENT_DISCONNECTED_HANDLER,
          }).toValue(null),

        [WebSocketBindingKeys.MESSAGE_HANDLER]: Binding.bind<TWebSocketMessageHandler | null>({
          key: WebSocketBindingKeys.MESSAGE_HANDLER,
        }).toValue(null),

        [WebSocketBindingKeys.OUTBOUND_TRANSFORMER]:
          Binding.bind<TWebSocketOutboundTransformer | null>({
            key: WebSocketBindingKeys.OUTBOUND_TRANSFORMER,
          }).toValue(null),

        [WebSocketBindingKeys.HANDSHAKE_HANDLER]: Binding.bind<TWebSocketHandshakeFn | null>({
          key: WebSocketBindingKeys.HANDSHAKE_HANDLER,
        }).toValue(null),
      },
    });
  }

  // --------------------------------------------------------------------------
  private resolveBindings(): IResolvedBindings {
    const extraServerOptions =
      this.application.get<Partial<IServerOptions>>({
        key: WebSocketBindingKeys.SERVER_OPTIONS,
        isOptional: true,
      }) ?? {};
    this.serverOptions = Object.assign({}, DEFAULT_SERVER_OPTIONS, extraServerOptions);

    const redisConnection = this.application.get<DefaultRedisHelper>({
      key: WebSocketBindingKeys.REDIS_CONNECTION,
    });
    if (!(redisConnection instanceof DefaultRedisHelper)) {
      throw getError({
        message:
          '[WebSocketComponent][resolveBindings] Invalid instance of redisConnection | Please init connection with RedisHelper for single redis connection or RedisClusterHelper for redis cluster mode!',
      });
    }

    const authenticateFn = this.application.get<TWebSocketAuthenticateFn>({
      key: WebSocketBindingKeys.AUTHENTICATE_HANDLER,
    });
    if (!authenticateFn) {
      throw getError({
        message: '[WebSocketComponent] Invalid authenticateFn to setup WebSocket server!',
      });
    }

    const validateRoomFn =
      this.application.get<TWebSocketValidateRoomFn | null>({
        key: WebSocketBindingKeys.VALIDATE_ROOM_HANDLER,
      }) ?? undefined;
    const clientConnectedFn =
      this.application.get<TWebSocketClientConnectedFn | null>({
        key: WebSocketBindingKeys.CLIENT_CONNECTED_HANDLER,
      }) ?? undefined;
    const clientDisconnectedFn =
      this.application.get<TWebSocketClientDisconnectedFn | null>({
        key: WebSocketBindingKeys.CLIENT_DISCONNECTED_HANDLER,
      }) ?? undefined;
    const messageHandler =
      this.application.get<TWebSocketMessageHandler | null>({
        key: WebSocketBindingKeys.MESSAGE_HANDLER,
      }) ?? undefined;
    const outboundTransformer =
      this.application.get<TWebSocketOutboundTransformer | null>({
        key: WebSocketBindingKeys.OUTBOUND_TRANSFORMER,
      }) ?? undefined;
    const handshakeFn =
      this.application.get<TWebSocketHandshakeFn | null>({
        key: WebSocketBindingKeys.HANDSHAKE_HANDLER,
      }) ?? undefined;

    return {
      redisConnection,
      authenticateFn,
      validateRoomFn,
      clientConnectedFn,
      clientDisconnectedFn,
      messageHandler,
      outboundTransformer,
      handshakeFn,
    };
  }

  // --------------------------------------------------------------------------
  private registerBunHook(opts: IResolvedBindings) {
    const {
      redisConnection,
      authenticateFn,
      validateRoomFn,
      clientConnectedFn,
      clientDisconnectedFn,
      messageHandler,
      outboundTransformer,
      handshakeFn,
    } = opts;
    const serverOptions = this.serverOptions;

    const logger = this.logger.for(this.registerBunHook.name);

    this.application.registerPostStartHook({
      identifier: 'websocket-initialize',
      hook: async () => {
        const serverInstance = this.application.getServerInstance<TBunServerInstance>();
        const honoServer = this.application.getServer();

        if (!serverInstance) {
          throw getError({
            message: '[WebSocketComponent] Bun server instance not available!',
          });
        }

        const wsHelper = new WebSocketServerHelper({
          identifier: serverOptions.identifier,
          path: serverOptions.path,
          defaultRooms: serverOptions.defaultRooms,
          serverOptions: serverOptions.serverOptions,
          heartbeatInterval: serverOptions.heartbeatInterval,
          heartbeatTimeout: serverOptions.heartbeatTimeout,
          server: serverInstance,
          redisConnection,
          authenticateFn,
          validateRoomFn,
          clientConnectedFn,
          clientDisconnectedFn,
          messageHandler,
          outboundTransformer,
          handshakeFn,
          requireEncryption: serverOptions.requireEncryption,
        } satisfies IWebSocketServerOptions);
        await wsHelper.configure();

        this.application.bind({ key: WebSocketBindingKeys.WEBSOCKET_INSTANCE }).toValue(wsHelper);

        const wsPath = serverOptions.path ?? WebSocketDefaults.PATH;

        serverInstance.reload({
          fetch: createBunFetchHandler({ wsPath, honoServer }),
          websocket: wsHelper.getBunWebSocketHandler(),
        });

        logger.info('WebSocket initialized for Bun runtime');
      },
    });
  }

  // --------------------------------------------------------------------------
  override binding(): ValueOrPromise<void> {
    const logger = this.logger.for(this.binding.name);

    if (!this.application) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
        message: '[binding] Invalid application to bind WebSocketComponent',
      });
    }

    logger.info('Binding WebSocket for application...');

    // Runtime check — Bun only
    const runtime = RuntimeModules.detect();
    if (runtime === RuntimeModules.NODE) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
        message:
          '[WebSocketComponent] Node.js runtime is not supported yet. Please use Bun runtime.',
      });
    }

    const resolved = this.resolveBindings();
    logger.debug('WebSocket Server Options: %j', this.serverOptions);

    this.registerBunHook(resolved);
  }
}
