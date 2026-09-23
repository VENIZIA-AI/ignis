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
  BindingNamespaces,
  CASBIN_RBAC_DOMAIN_SCOPED_MODEL,
  CasbinAuthorizationEnforcer,
  CasbinEnforcerModelDrivers,
  HealthCheckComponent,
  IApplicationConfigs,
  IApplicationInfo,
  JWKSIssuerAuthenticationStrategy,
  ScopedCasbinAdapter,
} from '@venizia/ignis';
import { StaticAssetComponent } from '@venizia/ignis/static-asset';
import {
  applicationEnvironment,
  blankToUndefined,
  Environment,
  getError,
  HTTP,
  int,
  RedisSingleHelper,
} from '@venizia/ignis-helpers';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import packageJson from './../package.json';
import { EnvironmentKeys } from './common';
import { PostgresDataSource } from './datasources/postgres.datasource';
import { GeneratedArtifacts } from './generated/artifacts';
import { Organization, Permission, PolicyDefinition, Role } from './models/entities';
import { RepositoryTestService } from './services/repository-test.service';

export const beConfigs: IApplicationConfigs = {
  host: process.env.APP_ENV_SERVER_HOST,
  port: int(blankToUndefined(process.env.APP_ENV_SERVER_PORT) ?? '3000'),
  path: { base: process.env.APP_ENV_SERVER_BASE_PATH ?? '/v1/api', isStrict: true },
  error: { rootKey: 'error' },
  debug: { shouldShowRoutes: !Environment.is({ name: Environment.PRODUCTION }) },

  // Every decorated class under src/, listed at build time by `bun run generate:artifacts`.
  artifacts: GeneratedArtifacts,
};

export class Application extends BaseApplication {
  override getAppInfo(): IApplicationInfo {
    return packageJson;
  }

  // Static assets in this example are the DB-backed StaticAssetComponent (`/assets`, `/resources`,
  // see PlatformComponent) - there is no local folder to serve here.
  override staticConfigure(): void {}

  override setupMiddlewares(): void {
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
    server.use(
      '*',
      bodyLimit({
        maxSize: 100 * 1024 * 1024,
        onError: context => context.json({}, HTTP.ResultCodes.RS_4.ContentTooLarge),
      }),
    );
  }

  // The framework features this application turns on. Their options come from PlatformComponent.
  override preConfigure(): void {
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

  override async postConfigure(): Promise<void> {
    this.registerAuthorizationEnforcer();

    await this.runRepositoryTests();
  }

  /** The suites write, delete and lock rows, so they run only on request and never in production. */
  private async runRepositoryTests(): Promise<void> {
    const isRequested = applicationEnvironment.get<string>(
      EnvironmentKeys.APP_ENV_RUN_REPOSITORY_TESTS,
    );
    if (isRequested !== 'true') {
      return;
    }

    if (Environment.is({ name: Environment.PRODUCTION })) {
      throw getError({
        message: '[runRepositoryTests] APP_ENV_RUN_REPOSITORY_TESTS=true is refused in production',
      });
    }

    await this.get<RepositoryTestService>({
      key: { namespace: BindingNamespaces.SERVICE, key: RepositoryTestService.name },
    }).runAllTests();
  }

  /**
   * Scoped Casbin RBAC: policies live in PolicyDefinition, each in an Organization domain, and each
   * user's policy lines are cached in Redis for five minutes.
   */
  private registerAuthorizationEnforcer(): void {
    const dataSource = this.get<PostgresDataSource>({
      key: { namespace: BindingNamespaces.DATASOURCE, key: PostgresDataSource.name },
    });

    const adapter = new ScopedCasbinAdapter({
      dataSource,
      entities: {
        policyDefinition: { tableName: PolicyDefinition.name },
        permission: { tableName: Permission.name },
        // `user` matches the principalType the sign-in token carries; `Role` labels role subjects.
        principals: { user: 'user', role: Role.name },
        domainTypes: [Organization.name],
      },
    });

    const redis = new RedisSingleHelper({
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
                connection: redis,
                expiresIn: 5 * 60 * 1000,
                keyFn: ({ user }) => `authz:policies:${user.userId}`,
              },
            },
          },
        },
      ],
    });
  }
}
