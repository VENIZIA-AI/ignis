import {
  BaseApplication,
  CoreBindings,
  HealthCheckBindingKeys,
  HealthCheckComponent,
  IApplicationConfigs,
  IApplicationInfo,
  IHealthCheckOptions,
  ApiReferenceComponent,
  ValueOrPromise,
} from '@venizia/ignis';
import { Environment } from '@venizia/ignis-helpers';
import { cors } from 'hono/cors';
import packageJson from './../package.json';
import { SearchDataSource } from './datasources';
import { ArticleRepository } from './repositories';
import { ArticleController, ArticleSearchController } from './controllers';

// -----------------------------------------------------------------------------------------------
export const beConfigs: IApplicationConfigs = {
  host: process.env.APP_ENV_SERVER_HOST,
  port: +(process.env.APP_ENV_SERVER_PORT ?? 3000),
  path: {
    base: process.env.APP_ENV_SERVER_BASE_PATH ?? '/api',
    isStrict: true,
  },
  error: { rootKey: 'error' },
  debug: {
    shouldShowRoutes: !Environment.is({ name: Environment.PRODUCTION }),
  },
};

// -----------------------------------------------------------------------------------------------
export class Application extends BaseApplication {
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
    // Nothing to serve statically - this example has no upload/asset surface.
  }

  // --------------------------------------------------------------------------------
  override setupMiddlewares(): ValueOrPromise<void> {
    const server = this.getServer();

    server.use(
      '*',
      cors({
        origin: '*',
        allowMethods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
        maxAge: 86_400,
        credentials: true,
      }),
    );
  }

  // --------------------------------------------------------------------------------
  /**
   * Manual registration (booter can't discover .ts files when running from source) -
   * same convention as every other IGNIS example. Zero @venizia/ignis-boot usage.
   */
  preConfigure(): ValueOrPromise<void> {
    this.dataSource(SearchDataSource);
    this.repository(ArticleRepository);

    this.controller(ArticleController);
    this.controller(ArticleSearchController);

    this.bind<IHealthCheckOptions>({
      key: HealthCheckBindingKeys.HEALTH_CHECK_OPTIONS,
    }).toValue({
      restOptions: { path: '/health-check' },
    });
    this.component(HealthCheckComponent);

    this.component(ApiReferenceComponent);
  }

  // --------------------------------------------------------------------------------
  async postConfigure(): Promise<void> {
    this.logger.info(
      '[postConfigure] Inspect all of application binding keys: %s',
      Array.from(this.bindings.keys()),
    );
  }
}
