import {
  ApiReferenceComponent,
  AuthenticateComponent,
  Authentication,
  AuthenticationStrategyRegistry,
  AuthorizationEnforcerRegistry,
  AuthorizationEnforcerTypes,
  AuthorizeComponent,
  BaseApplication,
  BasicAuthenticationStrategy,
  BindingKeys,
  BindingNamespaces,
  CASBIN_RBAC_DOMAIN_SCOPED_MODEL,
  CasbinAuthorizationEnforcer,
  CasbinEnforcerModelDrivers,
  CoreBindings,
  HealthCheckComponent,
  IApplicationConfigs,
  IApplicationInfo,
  IMiddlewareConfigs,
  JWKSIssuerAuthenticationStrategy,
  ScopedCasbinAdapter,
  ValueOrPromise,
} from '@venizia/ignis';
import { StaticAssetComponent } from '@venizia/ignis/static-asset';
import {
  applicationEnvironment,
  blankToUndefined,
  Environment,
  HTTP,
  int,
  RedisSingleHelper,
} from '@venizia/ignis-helpers';
import isEmpty from 'lodash/isEmpty';
import path from 'node:path';
import packageJson from './../package.json';
import { EnvironmentKeys } from './common';
import { PostgresDataSource } from './datasources/postgres.datasource';
// Side effects only: importing every decorated class is what discovery needs. No list.
import './generated/artifacts';
import { Organization, Permission, PolicyDefinition, Role } from './models/entities';
import { RowLockingTestService } from './services/tests/row-locking';

// -----------------------------------------------------------------------------------------------
export const beConfigs: IApplicationConfigs = {
  host: process.env.APP_ENV_SERVER_HOST,
  port: +(blankToUndefined(process.env.APP_ENV_SERVER_PORT) ?? 3000),
  path: {
    base: process.env.APP_ENV_SERVER_BASE_PATH!,
    isStrict: true,
  },
  error: { rootKey: 'error' },
  debug: {
    shouldShowRoutes: !Environment.is({ name: Environment.PRODUCTION }),
  },

  // Every decorated class under src/ registers itself. The application lists none of its own - the
  // stereotype is the whole declaration, and `src/generated/artifacts` is imported for its side
  // effects so the classes exist at run time.
  discoverArtifacts: true,
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
    this.static({ folderPath: path.join(__dirname, '../public') });
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
        maxSize: 100 * 1024 * 1024, // 100MB
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
        .debug(
          '[setupMiddlewares] Setting up middleware | name: %s | enable: %s | opts: %j',
          name,
          enable,
          mwOptions,
        );
      if (!isEmpty(mwPath)) {
        server.use(mwPath, module?.[name]?.(mwOptions));
        continue;
      }

      server.use(module?.[name]?.(mwOptions));
    }
  }

  // --------------------------------------------------------------------------------
  preConfigure(): ValueOrPromise<void> {
    // The framework features this application turns on. Its OWN classes declare nothing - a
    // stereotype is the whole declaration. Component options come from PlatformComponent.
    this.component(HealthCheckComponent);
    this.component(ApiReferenceComponent);
    this.component(AuthenticateComponent);
    this.component(AuthorizeComponent);
    this.component(StaticAssetComponent);

    AuthenticationStrategyRegistry.getInstance().register({
      container: this,
      strategies: [
        { name: Authentication.STRATEGY_JWT, strategy: JWKSIssuerAuthenticationStrategy },
        { name: Authentication.STRATEGY_BASIC, strategy: BasicAuthenticationStrategy },
      ],
    });
  }

  // --------------------------------------------------------------------------------
  async registerAuthorizationEnforcer() {
    const dataSource = this.get<PostgresDataSource>({
      key: BindingKeys.build({
        namespace: BindingNamespaces.DATASOURCE,
        key: PostgresDataSource.name,
      }),
    });

    const adapter = new ScopedCasbinAdapter({
      dataSource,
      entities: {
        policyDefinition: { tableName: PolicyDefinition.name },
        permission: { tableName: Permission.name },
        // `user` matches the authenticated user's principalType; `role` is the role-subject label.
        principals: { user: 'user', role: Role.name },
        domainTypes: [Organization.name],
      },
    });

    // Redis connection for authorization cache
    const redisHelper = new RedisSingleHelper({
      name: 'authorization-cache',
      host: applicationEnvironment.get<string>(EnvironmentKeys.APP_ENV_AUTHORZ_REDIS_HOST),
      port: applicationEnvironment.get<string>(EnvironmentKeys.APP_ENV_AUTHORZ_REDIS_PORT),
      password: applicationEnvironment.get<string>(EnvironmentKeys.APP_ENV_AUTHORZ_REDIS_PASSWORD),
      database: int(
        applicationEnvironment.get(EnvironmentKeys.APP_ENV_AUTHORZ_REDIS_DB, { defaultValue: '8' }),
      ),
    });

    AuthorizationEnforcerRegistry.getInstance().register({
      container: this,
      enforcers: [
        {
          enforcer: CasbinAuthorizationEnforcer,
          name: 'casbin',
          type: AuthorizationEnforcerTypes.CASBIN,
          options: {
            model: {
              driver: CasbinEnforcerModelDrivers.TEXT,
              definition: CASBIN_RBAC_DOMAIN_SCOPED_MODEL,
            },
            isScoped: true,
            adapter,
            cached: {
              use: true,
              driver: 'redis',
              options: {
                connection: redisHelper,
                expiresIn: 5 * 60 * 1000, // 5 minutes TTL
                keyFn: ({ user }: any) => `authz:policies:${user.userId}`,
              },
            },
          },
        },
      ],
    });
  }

  // --------------------------------------------------------------------------------
  async postConfigure(): Promise<void> {
    this.logger.info(
      '[postConfigure] Inspect all of application binding keys: %s',
      Array.from(this.bindings.keys()),
    );

    await this.registerAuthorizationEnforcer();

    await this.runRepositoryTests();
  }

  private async runRepositoryTests(): Promise<void> {
    const testService = this.get<RowLockingTestService>({
      key: BindingKeys.build({
        namespace: BindingNamespaces.SERVICE,
        key: RowLockingTestService.name,
      }),
    });
    await testService.run();
  }
}
