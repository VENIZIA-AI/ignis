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
  IHealthCheckOptions,
  IMiddlewareConfigs,
  ISocketIOServerBaseOptions,
  int,
  RedisHelper,
  SocketIOBindingKeys,
  SocketIOComponent,
  SocketIOServerHelper,
  SwaggerComponent,
  ValueOrPromise,
} from '@venizia/ignis';
import isEmpty from 'lodash/isEmpty';
import packageJson from './../package.json';
import { EnvironmentKeys } from './common/environments';
import { SocketTestController } from './controllers';
import { SocketEventService } from './services';

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
  setupSocketIO() {
    // Redis connection
    const redisHost = applicationEnvironment.get<string>(EnvironmentKeys.APP_ENV_REDIS_SOCKETIO_HOST);
    const redisPort = int(
      applicationEnvironment.get<string>(EnvironmentKeys.APP_ENV_REDIS_SOCKETIO_PORT),
    );
    const redisPassword = applicationEnvironment.get<string>(
      EnvironmentKeys.APP_ENV_REDIS_SOCKETIO_PASSWORD,
    );

    this.redisHelper = new RedisHelper({
      name: 'socket-io-redis',
      host: redisHost,
      port: redisPort,
      password: redisPassword,
      autoConnect: false,
    });

    this.bind<RedisHelper>({
      key: SocketIOBindingKeys.REDIS_CONNECTION,
    }).toValue(this.redisHelper);

    // Authenticate handler
    const authenticateFn: ISocketIOServerBaseOptions['authenticateFn'] = handshake => {
      const logger = this.logger.for('authenticateFn');
      logger.info('Authenticating client | headers: %j', handshake.headers);

      const authHeader = handshake.headers.authorization;
      if (!authHeader) {
        logger.warn('No authorization header provided');
        // For testing, allow connections without auth
        return true;
      }

      // Validate token here (JWT, etc.)
      logger.info('Client authenticated successfully');
      return true;
    };

    this.bind<ISocketIOServerBaseOptions['authenticateFn']>({
      key: SocketIOBindingKeys.AUTHENTICATE_HANDLER,
    }).toValue(authenticateFn);

    // Client connected handler
    const clientConnectedFn: ISocketIOServerBaseOptions['clientConnectedFn'] = ({ socket }) => {
      this.logger.for('clientConnectedFn').info('Client connected | id: %s', socket.id);

      const socketEventService = this.get<SocketEventService>({
        key: BindingKeys.build({
          namespace: BindingNamespaces.SERVICE,
          key: SocketEventService.name,
        }),
      });

      socketEventService.registerClientHandlers({ socket });
    };

    this.bind<ISocketIOServerBaseOptions['clientConnectedFn']>({
      key: SocketIOBindingKeys.CLIENT_CONNECTED_HANDLER,
    }).toValue(clientConnectedFn);

    // Register SocketIO Component
    this.component(SocketIOComponent);
  }

  // --------------------------------------------------------------------------------
  preConfigure(): ValueOrPromise<void> {
    // Health Check
    this.bind<IHealthCheckOptions>({
      key: HealthCheckBindingKeys.HEALTH_CHECK_OPTIONS,
    }).toValue({
      restOptions: { path: '/health-check' },
    });
    this.component(HealthCheckComponent);

    // Swagger
    this.component(SwaggerComponent);

    // Socket.IO
    this.setupSocketIO();

    // Services & Controllers
    this.service(SocketEventService);
    this.controller(SocketTestController);
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

    const socketIOHelper = this.get<SocketIOServerHelper>({
      key: SocketIOBindingKeys.SOCKET_IO_INSTANCE,
      isOptional: true,
    });

    if (socketIOHelper) {
      await socketIOHelper.shutdown();
    }

    if (this.redisHelper) {
      await this.redisHelper.disconnect();
    }

    await super.stop();
  }
}
