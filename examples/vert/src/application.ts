import {
  AuthenticateComponent,
  Authentication,
  AuthenticationStrategyRegistry,
  BaseApplication,
  Environment,
  HealthCheckBindingKeys,
  HealthCheckComponent,
  HTTP,
  IApplicationConfigs,
  IApplicationInfo,
  IHealthCheckOptions,
  IMiddlewareConfigs,
  JWTAuthenticationStrategy,
  SwaggerComponent,
  ValueOrPromise,
} from '@vez/ignis';
import isEmpty from 'lodash/isEmpty';
import path from 'node:path';
import packageJson from './../package.json';
import { TestController } from './controllers/test.controller';
import { PostgresDataSource } from './datasources';
import { ConfigurationRepository } from './repositories';
import { AuthenticationService } from './services';

// -----------------------------------------------------------------------------------------------
export const beConfigs: IApplicationConfigs = {
  host: process.env.APP_ENV_SERVER_HOST,
  port: +(process.env.APP_ENV_SERVER_PORT ?? 3000),
  path: {
    base: process.env.APP_ENV_SERVER_BASE_PATH,
    isStrict: true,
  },
  debug: {
    showRoutes: process.env.NODE_ENV !== Environment.PRODUCTION,
  },
};

// -----------------------------------------------------------------------------------------------
export class Application extends BaseApplication {
  override getAppInfo(): ValueOrPromise<IApplicationInfo> {
    return packageJson;
  }

  staticConfigure(): void {
    this.static({ folderPath: path.join(__dirname, '../public') });
  }

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
        maxSize: 100 * 1024 * 1024, // 100MB
        onError: c => {
          return c.json({}, HTTP.ResultCodes.RS_4.ContentTooLarge);
        },
      },
    };

    for (const name in middlewares) {
      const mwDef = middlewares[name];
      const { enable = false, path, module, ...mwOptions } = mwDef;

      if (!enable) {
        this.logger.debug(
          '[setupMiddlewares] Skip setup middleware | name: %s | enable: %s',
          name,
          enable,
        );
        continue;
      }

      this.logger.debug(
        '[setupMiddlewares] Setting up middleware | name: %s | enable: %s | opts: %j',
        name,
        enable,
        mwOptions,
      );
      if (!isEmpty(path)) {
        server.use(path, module?.[name]?.(mwOptions));
        continue;
      }

      server.use(module?.[name]?.(mwOptions));
    }
  }

  registerAuth() {
    this.service(AuthenticationService);
    this.component(AuthenticateComponent);
    AuthenticationStrategyRegistry.getInstance().register({
      container: this,
      name: Authentication.STRATEGY_JWT,
      strategy: JWTAuthenticationStrategy,
    });
  }

  preConfigure(): ValueOrPromise<void> {
    // DataSources
    this.dataSource(PostgresDataSource);

    // Repositories
    this.repository(ConfigurationRepository);

    // Services
    this.registerAuth();

    // Controllers
    this.controller(TestController);

    // Extra Components
    this.bind<IHealthCheckOptions>({
      key: HealthCheckBindingKeys.HEALTH_CHECK_OPTIONS,
    }).toValue({
      restOptions: { path: '/health-check' },
    });

    this.component(HealthCheckComponent);
    this.component(SwaggerComponent);
  }

  postConfigure(): ValueOrPromise<void> {
    console.log(this.bindings.keys());

    const configurationRepository = this.get<ConfigurationRepository>({
      key: 'repositories.ConfigurationRepository',
    });

    configurationRepository
      .findById({
        id: '619ce5bb-001a-40d1-a90f-3d6396c11119',
         
      })
      .then(console.log)
      .catch(console.error);
  }
}
