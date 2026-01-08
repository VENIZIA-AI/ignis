import {
  ChangePasswordRequestSchema,
  ChangePasswordResponseSchema,
  SignInRequestSchema,
  SignInResponseSchema,
  SignUpRequestSchema,
  SignUpResponseSchema,
} from '@/models';
import {
  applicationEnvironment,
  AuthenticateBindingKeys,
  AuthenticateComponent,
  Authentication,
  AuthenticationStrategyRegistry,
  BaseApplication,
  BaseMetaLinkModel,
  BindingKeys,
  BindingNamespaces,
  CoreBindings,
  DiskHelper,
  Environment,
  getError,
  HealthCheckBindingKeys,
  HealthCheckComponent,
  HTTP,
  IApplicationConfigs,
  IApplicationInfo,
  IHealthCheckOptions,
  IMiddlewareConfigs,
  int,
  BasicAuthenticationStrategy,
  JWTAuthenticationStrategy,
  MinioHelper,
  StaticAssetComponent,
  StaticAssetComponentBindingKeys,
  StaticAssetStorageTypes,
  SwaggerComponent,
  TStaticAssetsComponentOptions,
  ValueOrPromise,
  TAuthenticationRestOptions,
  IJWTTokenServiceOptions,
  IBasicTokenServiceOptions,
} from '@venizia/ignis';
import isEmpty from 'lodash/isEmpty';
import path from 'node:path';
import packageJson from './../package.json';
import { EnvironmentKeys } from './common/environments';
import { MetaLinkRepository } from './repositories/meta-link.repository';
import { AuthenticationService } from './services';
import { TestController } from './controllers';

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
      if (!isEmpty(mwPath)) {
        server.use(mwPath, module?.[name]?.(mwOptions));
        continue;
      }

      server.use(module?.[name]?.(mwOptions));
    }
  }

  // --------------------------------------------------------------------------------
  registerAuth() {
    this.bind<TAuthenticationRestOptions>({ key: AuthenticateBindingKeys.REST_OPTIONS }).toValue({
      useAuthController: true,
      controllerOpts: {
        restPath: '/auth',
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

    this.bind<IJWTTokenServiceOptions>({ key: AuthenticateBindingKeys.JWT_OPTIONS }).toValue({
      applicationSecret: applicationEnvironment.get<string>(
        EnvironmentKeys.APP_ENV_APPLICATION_SECRET,
      ),
      jwtSecret: applicationEnvironment.get<string>(EnvironmentKeys.APP_ENV_JWT_SECRET),
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
    });

    this.bind<IBasicTokenServiceOptions>({ key: AuthenticateBindingKeys.BASIC_OPTIONS }).toValue({
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

    AuthenticationStrategyRegistry.getInstance().register({
      container: this,
      strategies: [
        { name: Authentication.STRATEGY_JWT, strategy: JWTAuthenticationStrategy },
        { name: Authentication.STRATEGY_BASIC, strategy: BasicAuthenticationStrategy },
      ],
    });
  }

  // --------------------------------------------------------------------------------
  preConfigure(): ValueOrPromise<void> {
    this.registerAuth();

    // Extra Components
    this.bind<IHealthCheckOptions>({
      key: HealthCheckBindingKeys.HEALTH_CHECK_OPTIONS,
    }).toValue({
      restOptions: { path: '/health-check' },
    });
    this.component(HealthCheckComponent);

    // this.bind<ISwaggerOptions>({
    //   key: SwaggerBindingKeys.SWAGGER_OPTIONS,
    // }).toValue({
    //   restOptions: {
    //     base: { path: '/doc' },
    //     doc: { path: '/openapi.json' },
    //     ui: { path: '/explorer', type: 'swagger' }, // Use Swagger UI
    //   },
    //   explorer: {
    //     openapi: '3.0.0',
    //   },
    // });
    this.component(SwaggerComponent);

    this.bind<TStaticAssetsComponentOptions>({
      key: StaticAssetComponentBindingKeys.STATIC_ASSET_COMPONENT_OPTIONS,
    }).toValue({
      // MinIO storage for user uploads and media
      staticAsset: {
        controller: {
          name: 'AssetController',
          basePath: '/assets',
          isStrict: true,
        },
        storage: StaticAssetStorageTypes.MINIO,
        helper: new MinioHelper({
          endPoint: applicationEnvironment.get(EnvironmentKeys.APP_ENV_MINIO_HOST),
          port: int(applicationEnvironment.get(EnvironmentKeys.APP_ENV_MINIO_API_PORT)),
          accessKey: applicationEnvironment.get(EnvironmentKeys.APP_ENV_MINIO_ACCESS_KEY),
          secretKey: applicationEnvironment.get(EnvironmentKeys.APP_ENV_MINIO_SECRET_KEY),
          useSSL: false,
        }),
        useMetaLink: true,
        metaLink: {
          model: BaseMetaLinkModel,
          repository: this.get<MetaLinkRepository>({ key: 'repositories.MetaLinkRepository' }),
        },
        extra: {
          parseMultipartBody: {
            storage: 'memory',
          },
        },
      },
      // Local disk storage for temporary files and cache
      staticResource: {
        controller: {
          name: 'ResourceController',
          basePath: '/resources',
          isStrict: true,
        },
        storage: StaticAssetStorageTypes.DISK,
        helper: new DiskHelper({
          basePath: './app_data/resources',
        }),
        extra: {
          parseMultipartBody: {
            storage: 'memory',
          },
        },
      },
    });
    this.component(StaticAssetComponent);

    this.controller(TestController)
  }

  // --------------------------------------------------------------------------------
  async postConfigure(): Promise<void> {
    this.logger.info(
      '[postConfigure] Inspect all of application binding keys: %s',
      Array.from(this.bindings.keys()),
    );

    // Run all tests using the test service (repositories are injected via DI)
    // const testService = this.get<RepositoryTestService>({
    //   key: BindingKeys.build({
    //     namespace: BindingNamespaces.SERVICE,
    //     key: RepositoryTestService.name,
    //   }),
    // });
    // await testService.runAllTests();
  }
}
