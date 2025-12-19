import { PostgresDataSource } from '@/datasources';
import { ConfigurationRepository, UserRepository } from '@/repositories';
import {
  ChangePasswordRequestSchema,
  ChangePasswordResponseSchema,
  SignInRequestSchema,
  SignInResponseSchema,
  SignUpRequestSchema,
  SignUpResponseSchema,
} from '@/schemas';
import { AuthenticationService } from '@/services';
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
  DataTypes,
  DiskHelper,
  Environment,
  getError,
  getUID,
  HealthCheckBindingKeys,
  HealthCheckComponent,
  HTTP,
  IApplicationConfigs,
  IApplicationInfo,
  IAuthenticateOptions,
  IHealthCheckOptions,
  IMiddlewareConfigs,
  int,
  JWTAuthenticationStrategy,
  MinioHelper,
  StaticAssetComponent,
  StaticAssetComponentBindingKeys,
  StaticAssetStorageTypes,
  SwaggerComponent,
  TStaticAssetsComponentOptions,
  ValueOrPromise,
} from '@venizia/ignis';
import isEmpty from 'lodash/isEmpty';
import path from 'node:path';
import packageJson from './../package.json';
import { ConfigurationController, TestController } from './controllers';
import { MetaLinkRepository } from './repositories/meta-link.repository';
import { EnvironmentKeys } from './common/environments';

// -----------------------------------------------------------------------------------------------
export const beConfigs: IApplicationConfigs = {
  host: process.env.APP_ENV_SERVER_HOST,
  port: +(process.env.APP_ENV_SERVER_PORT ?? 3000),
  path: {
    base: process.env.APP_ENV_SERVER_BASE_PATH!,
    isStrict: true,
  },
  debug: {
    shouldShowRoutes: process.env.NODE_ENV !== Environment.PRODUCTION,
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

  registerAuth() {
    this.bind<IAuthenticateOptions>({ key: AuthenticateBindingKeys.AUTHENTICATE_OPTIONS }).toValue({
      alwaysAllowPaths: [],
      restOptions: {
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
      },
      tokenOptions: {
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
      },
    });
    this.component(AuthenticateComponent);
    this.service(AuthenticationService);
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
    this.repository(UserRepository);
    this.repository(ConfigurationRepository);
    this.repository(MetaLinkRepository);

    // Services
    this.registerAuth();

    // Controllers
    this.controller(TestController);
    this.controller(ConfigurationController);

    // Extra Components
    this.bind<IHealthCheckOptions>({
      key: HealthCheckBindingKeys.HEALTH_CHECK_OPTIONS,
    }).toValue({
      restOptions: { path: '/health-check' },
    });
    this.component(HealthCheckComponent);

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
  }

  async postConfigure(): Promise<void> {
    // ------------------------------------------------------------------------------------------------
    this.logger.info(
      '[postConfigure] Inspect all of application binding keys: %s',
      Array.from(this.bindings.keys()),
    );

    const configurationRepository = this.get<ConfigurationRepository>({
      key: BindingKeys.build({
        namespace: BindingNamespaces.REPOSITORY,
        key: ConfigurationRepository.name,
      }),
    });

    // ------------------------------------------------------------------------------------------------
    const case1 = await configurationRepository.findOne({
      filter: { where: { code: 'CODE_1' } },
    });
    this.logger.info(
      '[postConfigure] CASE_1 | Trying to findOne | condition: %j | rs: %o',
      { filter: { where: { code: 'CODE_1' } } },
      case1,
    );

    // ------------------------------------------------------------------------------------------------
    const case2 = await configurationRepository.find({
      filter: {
        where: { code: 'CODE_2' },
        fields: { id: true, code: true, dataType: true, createdBy: true },
        limit: 100,
        include: [{ relation: 'creator' }],
      },
    });
    this.logger.info(
      '[postConfigure] CASE_2 | Trying to find result | condition: %j | fields: %j | limit: %s | rs: %o',
      { where: { code: 'CODE_2' } },
      { fields: { id: true, code: true, dataType: true } },
      100,
      case2,
    );

    // ------------------------------------------------------------------------------------------------
    const case3Payload = {
      code: `CODE_${getUID()}`,
      group: 'SYSTEM',
      dataType: DataTypes.NUMBER,
      nValue: int((Math.random() * 100).toFixed(2)),
    };
    const case3 = await configurationRepository.create({ data: case3Payload });
    this.logger.info(
      '[postConfigure] CASE_3 | Trying to create | payload: %j | rs: %o',
      case3Payload,
      case3,
    );

    // ------------------------------------------------------------------------------------------------
    const case4Payload = [
      {
        code: `CODE_${getUID()}`,
        group: 'SYSTEM',
        dataType: DataTypes.NUMBER,
        nValue: int((Math.random() * 100).toFixed(2)),
      },
      {
        code: `CODE_${getUID()}`,
        group: 'SYSTEM',
        dataType: DataTypes.JSON,
        jValue: { value: int((Math.random() * 100).toFixed(2)) },
      },
    ];
    const case4 = await configurationRepository.createAll({ data: case4Payload });
    this.logger.info(
      '[postConfigure] CASE_4 | Trying to create | payload: %j | rs: %o',
      case4Payload,
      case4,
    );

    // ------------------------------------------------------------------------------------------------
    const case5Payload = {
      id: '89f1dceb-cb4b-44a6-af03-ea3a2472096c',
      data: { nValue: int((Math.random() * 100).toFixed(2)) },
    };
    const case5 = await configurationRepository.updateById(case5Payload);
    this.logger.info(
      '[postConfigure] CASE_5 | Trying to update | payload: %j | rs: %o',
      case5Payload,
      case5,
    );

    // ------------------------------------------------------------------------------------------------
    await configurationRepository.updateBy({
      data: {
        nValue: int((Math.random() * 100).toFixed(2)),
      },
      where: {
        id: '89f1dceb-cb4b-44a6-af03-ea3a2472096c',
      },
      options: { shouldReturn: false, log: { use: true } },
    });

    // ------------------------------------------------------------------------------------------------
    await configurationRepository.deleteById({
      id: case3.data!.id,
      options: { shouldReturn: true, log: { use: true } },
    });

    await configurationRepository.deleteAll({
      where: {
        and: [{ dataType: DataTypes.NUMBER }, { dataType: DataTypes.JSON }],
      },
      options: { shouldReturn: true, log: { use: true } },
    });
  }
}
