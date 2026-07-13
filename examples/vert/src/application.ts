import {
  ChangePasswordRequestSchema,
  ChangePasswordResponseSchema,
  SignInRequestSchema,
  SignInResponseSchema,
  SignUpRequestSchema,
  SignUpResponseSchema,
} from '@/models';
import {
  Authentication,
  AuthenticateBindingKeys,
  AuthenticateComponent,
  AuthenticationStrategyRegistry,
  AuthorizeBindingKeys,
  AuthorizeComponent,
  AuthorizationEnforcerRegistry,
  AuthorizationEnforcerTypes,
  CasbinEnforcerModelDrivers,
  BaseApplication,
  BindingKeys,
  BindingNamespaces,
  CasbinAuthorizationEnforcer,
  CASBIN_RBAC_DOMAIN_SCOPED_MODEL,
  CoreBindings,
  ScopedCasbinAdapter,
  HealthCheckBindingKeys,
  HealthCheckComponent,
  IApplicationConfigs,
  IApplicationInfo,
  IAuthorizeOptions,
  IHealthCheckOptions,
  IMiddlewareConfigs,
  JOSEStandards,
  JWKSIssuerAuthenticationStrategy,
  JWKSModes,
  BasicAuthenticationStrategy,
  ApiReferenceComponent,
  ValueOrPromise,
  TAuthenticationRestOptions,
  TJWTTokenServiceOptions,
  TBasicTokenServiceOptions,
  TJWKSKeyDriver,
  TJWKSKeyFormat,
} from '@venizia/ignis';
import {
  applicationEnvironment,
  Environment,
  getError,
  HTTP,
  int,
  RedisSingleHelper,
} from '@venizia/ignis-helpers';
import isEmpty from 'lodash/isEmpty';
import path from 'node:path';
import packageJson from './../package.json';
import { EnvironmentKeys } from './common/environments';
import { PostgresDataSource } from './datasources/postgres.datasource';
// import { MetaLinkRepository } from './repositories/meta-link.repository';
import {
  ConfigurationRepository,
  ProductRepository,
  SaleChannelProductRepository,
  SaleChannelRepository,
  UserRepository,
} from './repositories';
import { AuthenticationService } from './services';
import { RowLockingTestService } from './services/tests/row-locking-test.service';
// import { AuthorizationExampleController, TestController } from './controllers';
import { Organization, Permission, PolicyDefinition, Role } from './models/entities';

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
  registerAuth() {
    // Manual registration (booter can't discover .ts files when running from source)
    this.dataSource(PostgresDataSource);
    this.repository(UserRepository);
    this.repository(ConfigurationRepository);
    this.repository(ProductRepository);
    this.repository(SaleChannelRepository);
    this.repository(SaleChannelProductRepository);
    this.service(AuthenticationService);

    this.bind<TAuthenticationRestOptions>({ key: AuthenticateBindingKeys.REST_OPTIONS }).toValue({
      useAuthController: true,
      controllerOpts: {
        restPath: '/auth',
        serviceKey: BindingKeys.build({
          namespace: BindingNamespaces.SERVICE,
          key: AuthenticationService.name,
        }),
        payload: {
          signIn: {
            request: { schema: SignInRequestSchema },
            response: { schema: SignInResponseSchema },
          },
          signUp: {
            request: { schema: SignUpRequestSchema },
            response: { schema: SignUpResponseSchema },
          },
          changePassword: {
            request: { schema: ChangePasswordRequestSchema },
            response: { schema: ChangePasswordResponseSchema },
          },
        },
      },
    });

    this.bind<TJWTTokenServiceOptions>({ key: AuthenticateBindingKeys.JWT_OPTIONS }).toValue({
      standard: JOSEStandards.JWKS,
      options: {
        mode: JWKSModes.ISSUER,
        algorithm: applicationEnvironment.get<string>(
          EnvironmentKeys.APP_ENV_JWKS_ALGORITHM,
        ) as 'ES256',
        keys: {
          driver: applicationEnvironment.get<TJWKSKeyDriver>(
            EnvironmentKeys.APP_ENV_JWKS_KEY_DRIVER,
          ),
          format: applicationEnvironment.get<TJWKSKeyFormat>(
            EnvironmentKeys.APP_ENV_JWKS_KEY_FORMAT,
          ),
          private: applicationEnvironment.get<string>(EnvironmentKeys.APP_ENV_JWKS_PRIVATE_KEY),
          public: applicationEnvironment.get<string>(EnvironmentKeys.APP_ENV_JWKS_PUBLIC_KEY),
        },
        kid: applicationEnvironment.get<string>(EnvironmentKeys.APP_ENV_JWKS_KID),
        getTokenExpiresFn: () => {
          const jwtExpiresIn = applicationEnvironment.get<string>(
            EnvironmentKeys.APP_ENV_JWT_EXPIRES_IN,
          );
          if (!jwtExpiresIn) {
            throw getError({
              message: `[getTokenExpiresFn] Invalid APP_ENV_JWT_EXPIRES_IN | jwtExpiresIn: ${jwtExpiresIn}`,
            });
          }

          return parseInt(jwtExpiresIn);
        },
      },
    });

    this.bind<TBasicTokenServiceOptions>({ key: AuthenticateBindingKeys.BASIC_OPTIONS }).toValue({
      verifyCredentials: async opts => {
        const authenticateService = this.get<AuthenticationService>({
          key: BindingKeys.build({
            namespace: BindingNamespaces.SERVICE,
            key: AuthenticationService.name,
          }),
        });
        return authenticateService.signIn(opts.context, {
          identifier: { scheme: 'username', value: opts.credentials.username },
          credential: { scheme: 'basic', value: opts.credentials.password },
        });
      },
    });

    this.component(AuthenticateComponent);

    // Register authentication strategies
    AuthenticationStrategyRegistry.getInstance().register({
      container: this,
      strategies: [
        { name: Authentication.STRATEGY_JWT, strategy: JWKSIssuerAuthenticationStrategy },
        { name: Authentication.STRATEGY_BASIC, strategy: BasicAuthenticationStrategy },
      ],
    });
  }

  // --------------------------------------------------------------------------------
  preConfigure(): ValueOrPromise<void> {
    this.registerAuth();
    this.registerTestDependencies();

    // Extra Components
    this.bind<IHealthCheckOptions>({
      key: HealthCheckBindingKeys.HEALTH_CHECK_OPTIONS,
    }).toValue({
      restOptions: { path: '/health-check' },
    });
    this.component(HealthCheckComponent);

    this.component(ApiReferenceComponent);

    // TODO: Fix MetaLinkRepository ordering — temporarily disabled for JWKS testing
    // this.bind<TStaticAssetsComponentOptions>({
    //   key: StaticAssetComponentBindingKeys.STATIC_ASSET_COMPONENT_OPTIONS,
    // }).toValue({
    //   staticAsset: {
    //     controller: { name: 'AssetController', basePath: '/assets', isStrict: true },
    //     storage: StaticAssetStorageTypes.MINIO,
    //     helper: new MinioHelper({
    //       endPoint: applicationEnvironment.get(EnvironmentKeys.APP_ENV_MINIO_HOST),
    //       port: int(applicationEnvironment.get(EnvironmentKeys.APP_ENV_MINIO_API_PORT)),
    //       accessKey: applicationEnvironment.get(EnvironmentKeys.APP_ENV_MINIO_ACCESS_KEY),
    //       secretKey: applicationEnvironment.get(EnvironmentKeys.APP_ENV_MINIO_SECRET_KEY),
    //       useSSL: false,
    //     }),
    //     useMetaLink: true,
    //     metaLink: {
    //       model: BaseMetaLinkModel,
    //       repository: this.get<MetaLinkRepository>({ key: 'repositories.MetaLinkRepository' }),
    //     },
    //     extra: { parseMultipartBody: { storage: 'memory' } },
    //   },
    //   staticResource: {
    //     controller: { name: 'ResourceController', basePath: '/resources', isStrict: true },
    //     storage: StaticAssetStorageTypes.DISK,
    //     helper: new DiskHelper({ basePath: './app_data/resources' }),
    //     extra: { parseMultipartBody: { storage: 'memory' } },
    //   },
    // });
    // this.component(StaticAssetComponent);

    // this.controller(TestController);
    // this.controller(AuthorizationExampleController);
  }

  // --------------------------------------------------------------------------------
  async registerAuthorization() {
    const dataSource = this.get<PostgresDataSource>({ key: 'datasources.PostgresDataSource' });

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
      database: int(applicationEnvironment.get(EnvironmentKeys.APP_ENV_AUTHORZ_REDIS_DB) || '8'),
    });

    this.bind<IAuthorizeOptions>({ key: AuthorizeBindingKeys.OPTIONS }).toValue({
      defaultDecision: 'deny',
      alwaysAllowRoles: ['999_super-admin'],
      // Scoped RBAC: the request domain is the authenticated user's organization.
      domainResolver: ({ context }) => {
        const user = context.get(Authentication.CURRENT_USER) as
          | { organizationId?: string }
          | undefined;
        return user?.organizationId ? { type: Organization.name, id: user.organizationId } : null;
      },
    });

    this.component(AuthorizeComponent);

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

    await this.registerAuthorization();

    // Register test repositories & services, then run tests
    await this.runRepositoryTests();
  }

  private registerTestDependencies(): void {
    this.service(RowLockingTestService);
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
