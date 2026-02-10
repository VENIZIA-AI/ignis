import {
    applicationEnvironment,
    BaseApplication,
    BindingKeys,
    BindingNamespaces,
    CoreBindings,
    Environment,
    HealthCheckBindingKeys,
    HealthCheckComponent,
    HTTP,
    IApplicationConfigs,
    IApplicationInfo,
    IMiddlewareConfigs,
    int,
    RedisHelper,
    SwaggerComponent,
    TWebSocketAuthenticateFn,
    TWebSocketClientConnectedFn,
    TWebSocketClientDisconnectedFn,
    TWebSocketMessageHandler,
    TWebSocketValidateRoomFn,
    ValueOrPromise,
    WebSocketBindingKeys,
    WebSocketComponent,
    WebSocketServerHelper,
} from '@venizia/ignis';
import isEmpty from 'lodash/isEmpty';
import packageJson from './../package.json';
import { EnvironmentKeys } from './common/environments';
import { WebSocketTestController } from './controllers';
import { WebSocketEventService } from './services';

// -----------------------------------------------------------------------------------------------
export const beConfigs: IApplicationConfigs = {
  host: process.env.APP_ENV_SERVER_HOST,
  port: +(process.env.APP_ENV_SERVER_PORT ?? 3000),
  path: {
    base: process.env.APP_ENV_SERVER_BASE_PATH!,
    isStrict: true,
  },
  error: { rootKey: 'error' },
  debug: {
    shouldShowRoutes: process.env.NODE_ENV !== Environment.PRODUCTION,
  },
  bootOptions: {},
};

// -----------------------------------------------------------------------------------------------
export class Application extends BaseApplication {
  private redisHelper: RedisHelper;

  // --------------------------------------------------------------------------------
  override getProjectRoot(): string {
    const projectRoot = __dirname;
    this.bind<string>({ key: CoreBindings.APPLICATION_PROJECT_ROOT }).toValue(projectRoot);
    return projectRoot;
  }

  // --------------------------------------------------------------------------------
  override getAppInfo(): ValueOrPromise<IApplicationInfo> {
    return packageJson;
  }

  // --------------------------------------------------------------------------------
  staticConfigure(): void {
    // No static files for this test project
  }

  // --------------------------------------------------------------------------------
  override async setupMiddlewares() {
    const server = this.getServer();

    const middlewares: IMiddlewareConfigs = {
      cors: {
        enable: true,
        path: '*',
        module: await import('hono/cors'),
        origin: '*',
        allowMethods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
        maxAge: 86_400,
        credentials: true,
      },
      bodyLimit: {
        enable: true,
        path: '*',
        module: await import('hono/body-limit'),
        maxSize: 10 * 1024 * 1024, // 10MB
        onError: c => {
          return c.json({}, HTTP.ResultCodes.RS_4.ContentTooLarge);
        },
      },
    };

    for (const name in middlewares) {
      const mwDef = middlewares[name];
      const { enable = false, path: mwPath, module, ...mwOptions } = mwDef;

      if (!enable) {
        this.logger
          .for(this.setupMiddlewares.name)
          .debug('Skip setup middleware | name: %s | enable: %s', name, enable);
        continue;
      }

      this.logger
        .for(this.setupMiddlewares.name)
        .debug('Setting up middleware | name: %s | enable: %s', name, enable);

      if (!isEmpty(mwPath)) {
        server.use(mwPath, module?.[name]?.(mwOptions));
        continue;
      }

      server.use(module?.[name]?.(mwOptions));
    }
  }

  // --------------------------------------------------------------------------------
  setupWebSocket() {
    const logger = this.logger.for(this.setupWebSocket.name);

    // Redis connection
    const redisHost = applicationEnvironment.get<string>(EnvironmentKeys.APP_ENV_REDIS_WS_HOST);
    const redisPort = int(
      applicationEnvironment.get<string>(EnvironmentKeys.APP_ENV_REDIS_WS_PORT),
    );
    const redisPassword = applicationEnvironment.get<string>(
      EnvironmentKeys.APP_ENV_REDIS_WS_PASSWORD,
    );

    this.redisHelper = new RedisHelper({
      name: 'websocket-redis',
      host: redisHost,
      port: redisPort,
      password: redisPassword,
      autoConnect: false,
    });

    this.bind<RedisHelper>({
      key: WebSocketBindingKeys.REDIS_CONNECTION,
    }).toValue(this.redisHelper);

    // Server options — enable Bun native WebSocket pings for connection liveness
    this.bind({ key: WebSocketBindingKeys.SERVER_OPTIONS }).toValue({
      serverOptions: { sendPings: true },
    });

    // Authenticate handler — validates at upgrade time (before connection)
    const authenticateFn: TWebSocketAuthenticateFn = request => {
      logger.info('Authenticating WebSocket upgrade | url: %s', request.url);

      const token = request.headers?.['authorization'] as string | undefined;

      if (!token) {
        logger.warn('No token provided — allowing anonymous for testing');
        return { userId: `anon-${crypto.randomUUID().slice(0, 8)}` };
      }

      // In production, validate JWT here
      logger.info('Client authenticated | token: %s', token.slice(0, 20) + '...');
      return { userId: `user-${crypto.randomUUID().slice(0, 8)}`, metadata: { token } };
    };

    this.bind<TWebSocketAuthenticateFn>({
      key: WebSocketBindingKeys.AUTHENTICATE_HANDLER,
    }).toValue(authenticateFn);

    // Validate room handler — allow all rooms for testing
    const validateRoomFn: TWebSocketValidateRoomFn = ({ rooms }) => {
      logger.info('Validating rooms: %j', rooms);
      return rooms;
    };

    this.bind<TWebSocketValidateRoomFn>({
      key: WebSocketBindingKeys.VALIDATE_ROOM_HANDLER,
    }).toValue(validateRoomFn);

    // Client connected handler
    const clientConnectedFn: TWebSocketClientConnectedFn = ({ clientId, userId, metadata }) => {
      logger.info('Client connected | clientId: %s | userId: %s | metadata: %j', clientId, userId, metadata);
    };

    this.bind<TWebSocketClientConnectedFn>({
      key: WebSocketBindingKeys.CLIENT_CONNECTED_HANDLER,
    }).toValue(clientConnectedFn);

    // Client disconnected handler
    const clientDisconnectedFn: TWebSocketClientDisconnectedFn = ({ clientId, userId }) => {
      logger.info('Client disconnected | clientId: %s | userId: %s', clientId, userId);
    };

    this.bind<TWebSocketClientDisconnectedFn>({
      key: WebSocketBindingKeys.CLIENT_DISCONNECTED_HANDLER,
    }).toValue(clientDisconnectedFn);

    // Message handler — route custom events
    const messageHandler: TWebSocketMessageHandler = ({ clientId, userId, message }) => {
      logger.info('Message from %s (user: %s) | event: %s | data: %j', clientId, userId, message.event, message.data);

      const wsEventService = this.get<WebSocketEventService>({
        key: BindingKeys.build({
          namespace: BindingNamespaces.SERVICE,
          key: WebSocketEventService.name,
        }),
      });

      wsEventService.handleMessage({ clientId, userId, message });
    };

    this.bind<TWebSocketMessageHandler>({
      key: WebSocketBindingKeys.MESSAGE_HANDLER,
    }).toValue(messageHandler);

    // Register WebSocket Component
    this.component(WebSocketComponent);
  }

  // --------------------------------------------------------------------------------
  preConfigure(): ValueOrPromise<void> {
    // Health Check
    this.bind<{ restOptions: { path: string } }>({
      key: HealthCheckBindingKeys.HEALTH_CHECK_OPTIONS,
    }).toValue({
      restOptions: { path: '/health-check' },
    });
    this.component(HealthCheckComponent);

    // Swagger
    this.component(SwaggerComponent);

    // WebSocket
    this.setupWebSocket();

    // Services & Controllers
    this.service(WebSocketEventService);
    this.controller(WebSocketTestController);
  }

  // --------------------------------------------------------------------------------
  async postConfigure(): Promise<void> {
    this.logger.info(
      '[postConfigure] Application binding keys: %s',
      Array.from(this.bindings.keys()),
    );
  }

  // --------------------------------------------------------------------------------
  override async stop(): Promise<void> {
    this.logger.info('[stop] Shutting down application...');

    const wsHelper = this.get<WebSocketServerHelper>({
      key: WebSocketBindingKeys.WEBSOCKET_INSTANCE,
      isOptional: true,
    });

    if (wsHelper) {
      await wsHelper.shutdown();
    }

    if (this.redisHelper) {
      await this.redisHelper.disconnect();
    }

    await super.stop();
  }
}
