import { BaseApplication, TBunServerInstance } from '@/base/applications';
import { BaseComponent } from '@/base/components';
import { inject } from '@/base/metadata';
import { CoreBindings } from '@/common/bindings';
import { Binding } from '@/helpers/inversion';
import {
  DefaultRedisHelper,
  getError,
  HTTP,
  ISocketIOServerBaseOptions,
  RuntimeModules,
  SocketIOServerHelper,
  ValueOrPromise,
} from '@venizia/ignis-helpers';
import { ServerOptions } from 'socket.io';
import { SocketIOBindingKeys } from './keys';

interface IServerOptions extends ServerOptions {
  identifier: string;
}

const DEFAULT_SERVER_OPTIONS: Partial<IServerOptions> = {
  identifier: 'SOCKET_IO_SERVER',
  path: '/io',
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    preflightContinue: false,
    optionsSuccessStatus: 204,
    credentials: true,
  },
  perMessageDeflate: {
    threshold: 4096,
    zlibDeflateOptions: { chunkSize: 10 * 1024 },
    zlibInflateOptions: { windowBits: 12, memLevel: 8 },
    clientNoContextTakeover: true,
    serverNoContextTakeover: true,
    serverMaxWindowBits: 10,
    concurrencyLimit: 20,
  },
};

export class SocketIOComponent extends BaseComponent {
  protected serverOptions: Partial<IServerOptions>;

  constructor(
    @inject({ key: CoreBindings.APPLICATION_INSTANCE }) private application: BaseApplication,
  ) {
    super({ scope: SocketIOComponent.name });

    this.bindings = {
      [SocketIOBindingKeys.SERVER_OPTIONS]: Binding.bind<Partial<ServerOptions>>({
        key: SocketIOBindingKeys.SERVER_OPTIONS,
      }).toValue(DEFAULT_SERVER_OPTIONS),
      [SocketIOBindingKeys.REDIS_CONNECTION]: Binding.bind<DefaultRedisHelper | null>({
        key: SocketIOBindingKeys.REDIS_CONNECTION,
      }).toValue(null),
      [SocketIOBindingKeys.AUTHENTICATE_HANDLER]: Binding.bind<
        ISocketIOServerBaseOptions['authenticateFn'] | null
      >({ key: SocketIOBindingKeys.AUTHENTICATE_HANDLER }).toValue(null),
      [SocketIOBindingKeys.CLIENT_CONNECTED_HANDLER]: Binding.bind<
        ISocketIOServerBaseOptions['clientConnectedFn'] | null
      >({ key: SocketIOBindingKeys.CLIENT_CONNECTED_HANDLER }).toValue(null),
    };
  }

  // --------------------------------------------------------------------------
  private resolveBindings() {
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

    const authenticateFn = this.application.get<ISocketIOServerBaseOptions['authenticateFn']>({
      key: SocketIOBindingKeys.AUTHENTICATE_HANDLER,
    });
    if (!authenticateFn) {
      throw getError({
        message: '[DANGER][SocketIOComponent] Invalid authenticateFn to setup io socket server!',
      });
    }

    let clientConnectedFn: ISocketIOServerBaseOptions['clientConnectedFn'] | undefined;
    if (this.application.isBound({ key: SocketIOBindingKeys.CLIENT_CONNECTED_HANDLER })) {
      clientConnectedFn = this.application.get<ISocketIOServerBaseOptions['clientConnectedFn']>({
        key: SocketIOBindingKeys.CLIENT_CONNECTED_HANDLER,
      });
    }

    return { redisConnection, authenticateFn, clientConnectedFn };
  }

  // --------------------------------------------------------------------------
  private registerBunHook(opts: {
    redisConnection: DefaultRedisHelper;
    authenticateFn: ISocketIOServerBaseOptions['authenticateFn'];
    clientConnectedFn?: ISocketIOServerBaseOptions['clientConnectedFn'];
  }) {
    const { redisConnection, authenticateFn, clientConnectedFn } = opts;
    const serverOptions = this.serverOptions;

    this.application.registerPostStartHook({
      identifier: 'socket-io-initialize',
      hook: async () => {
        const { Server: BunEngine } = await import('@socket.io/bun-engine');

        // Extract cors fields explicitly to bridge socket.io/bun-engine type differences
        const corsConfig = typeof serverOptions.cors === 'object' ? serverOptions.cors : undefined;
        const engine = new BunEngine({
          path: serverOptions.path ?? '/socket.io/',
          ...(corsConfig && {
            cors: {
              origin: corsConfig.origin as string | RegExp | (string | RegExp)[] | undefined,
              methods: corsConfig.methods,
              credentials: corsConfig.credentials,
              allowedHeaders: corsConfig.allowedHeaders,
              exposedHeaders: corsConfig.exposedHeaders,
              maxAge: corsConfig.maxAge,
            },
          }),
        });

        const socketIOHelper = new SocketIOServerHelper({
          runtime: RuntimeModules.BUN,
          identifier: serverOptions.identifier!,
          engine,
          serverOptions,
          redisConnection,
          authenticateFn,
          clientConnectedFn,
        });

        this.application
          .bind({ key: SocketIOBindingKeys.SOCKET_IO_INSTANCE })
          .toValue(socketIOHelper);

        // Wire engine into the running Bun server via reload
        const serverInstance = this.application.getServerInstance<TBunServerInstance>();
        const honoServer = this.application.getServer();
        const engineHandler = engine.handler();
        const enginePath = serverOptions.path ?? '/socket.io/';

        serverInstance!.reload({
          fetch: (req, server) => {
            const url = new URL(req.url);

            if (!url.pathname.startsWith(enginePath)) {
              return honoServer.fetch(req, server);
            }

            const response = engine.handleRequest(req, server);
            if (response) {
              return response;
            }
          },
          websocket: engineHandler.websocket,
        });

        this.logger.for(this.registerBunHook.name).info('SocketIO initialized for Bun runtime');
      },
    });
  }

  // --------------------------------------------------------------------------
  private registerNodeHook(opts: {
    redisConnection: DefaultRedisHelper;
    authenticateFn: ISocketIOServerBaseOptions['authenticateFn'];
    clientConnectedFn?: ISocketIOServerBaseOptions['clientConnectedFn'];
  }) {
    const { redisConnection, authenticateFn, clientConnectedFn } = opts;
    const serverOptions = this.serverOptions;

    this.application.registerPostStartHook({
      identifier: 'socket-io-initialize',
      hook: () => {
        const httpServer = this.application.getServerInstance();
        if (!httpServer) {
          throw getError({
            message: '[SocketIOComponent] HTTP server not available for Node.js runtime!',
          });
        }

        const socketIOHelper = new SocketIOServerHelper({
          runtime: RuntimeModules.NODE,
          identifier: serverOptions.identifier!,
          server: httpServer,
          serverOptions,
          redisConnection,
          authenticateFn,
          clientConnectedFn,
        });

        this.application
          .bind({ key: SocketIOBindingKeys.SOCKET_IO_INSTANCE })
          .toValue(socketIOHelper);

        this.logger
          .for(this.registerNodeHook.name)
          .info('SocketIO initialized for Node.js runtime');
      },
    });
  }

  // --------------------------------------------------------------------------
  override binding(): ValueOrPromise<void> {
    if (!this.application) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
        message: '[binding] Invalid application to bind SocketIOComponent',
      });
    }

    this.logger.for(this.binding.name).info('Binding SocketIO for application...');

    const { redisConnection, authenticateFn, clientConnectedFn } = this.resolveBindings();
    this.logger.for(this.binding.name).debug('Socket.IO Server Options: %j', this.serverOptions);

    const runtime = RuntimeModules.detect();

    switch (runtime) {
      case RuntimeModules.BUN: {
        this.registerBunHook({ redisConnection, authenticateFn, clientConnectedFn });
        break;
      }
      case RuntimeModules.NODE: {
        this.registerNodeHook({ redisConnection, authenticateFn, clientConnectedFn });
        break;
      }
      default: {
        throw getError({ message: `[SocketIOComponent] Unsupported runtime: ${runtime}` });
      }
    }
  }
}
