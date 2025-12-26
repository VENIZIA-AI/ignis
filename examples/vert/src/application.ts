import {
  ChangePasswordRequestSchema,
  ChangePasswordResponseSchema,
  SignInRequestSchema,
  SignInResponseSchema,
  SignUpRequestSchema,
  SignUpResponseSchema,
} from '@/schemas';
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
  IsolationLevels,
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
import { EnvironmentKeys } from './common/environments';
import {
  ConfigurationRepository,
  ProductRepository,
  SaleChannelProductRepository,
  SaleChannelRepository,
} from './repositories';
import { MetaLinkRepository } from './repositories/meta-link.repository';

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
    AuthenticationStrategyRegistry.getInstance().register({
      container: this,
      name: Authentication.STRATEGY_JWT,
      strategy: JWTAuthenticationStrategy,
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

  // --------------------------------------------------------------------------------
  async postConfigure(): Promise<void> {
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

    const productRepository = this.get<ProductRepository>({
      key: BindingKeys.build({
        namespace: BindingNamespaces.REPOSITORY,
        key: ProductRepository.name,
      }),
    });

    const saleChannelRepository = this.get<SaleChannelRepository>({
      key: BindingKeys.build({
        namespace: BindingNamespaces.REPOSITORY,
        key: SaleChannelRepository.name,
      }),
    });

    const saleChannelProductRepository = this.get<SaleChannelProductRepository>({
      key: BindingKeys.build({
        namespace: BindingNamespaces.REPOSITORY,
        key: SaleChannelProductRepository.name,
      }),
    });

    await this.runRepositoryTests(configurationRepository);
    await this.runTransactionTests(configurationRepository);
    await this.runInclusionTests(
      productRepository,
      saleChannelRepository,
      saleChannelProductRepository,
    );
  }

  // --------------------------------------------------------------------------------
  // Repository Test Cases (without transaction)
  // --------------------------------------------------------------------------------
  async runRepositoryTests(repo: ConfigurationRepository): Promise<void> {
    this.logger.info('='.repeat(80));
    this.logger.info('[runRepositoryTests] Starting repository test cases (no transaction)');
    this.logger.info('='.repeat(80));

    await this.repoCase1_CreateSingle(repo);
    await this.repoCase2_CreateAll(repo);
    await this.repoCase3_FindOne(repo);
    await this.repoCase4_FindWithFilter(repo);
    await this.repoCase5_FindById(repo);
    await this.repoCase6_UpdateById(repo);
    await this.repoCase7_UpdateAll(repo);
    await this.repoCase8_DeleteByIdAndDeleteAll(repo);

    this.logger.info('='.repeat(80));
    this.logger.info('[runRepositoryTests] All repository test cases completed');
    this.logger.info('='.repeat(80));
  }

  // --------------------------------------------------------------------------------
  // REPO CASE 1: Create single record
  // --------------------------------------------------------------------------------
  private async repoCase1_CreateSingle(repo: ConfigurationRepository): Promise<void> {
    this.logger.info('-'.repeat(80));
    this.logger.info('[repoCase1_CreateSingle] Create single record');

    const code = `REPO_CREATE_${getUID()}`;

    try {
      const result = await repo.create({
        data: { code, group: 'REPO_TEST', dataType: DataTypes.NUMBER, nValue: 100 },
      });

      if (result.count === 1 && result.data?.code === code) {
        this.logger.info(
          '[repoCase1_CreateSingle] PASSED | Created record | id: %s | code: %s',
          result.data.id,
          result.data.code,
        );
      } else {
        this.logger.error('[repoCase1_CreateSingle] FAILED | Unexpected result: %j', result);
      }

      await repo.deleteAll({ where: { code } });
    } catch (error) {
      this.logger.error('[repoCase1_CreateSingle] FAILED | Error: %j', error);
    }
  }

  // --------------------------------------------------------------------------------
  // REPO CASE 2: CreateAll (batch create)
  // --------------------------------------------------------------------------------
  private async repoCase2_CreateAll(repo: ConfigurationRepository): Promise<void> {
    this.logger.info('-'.repeat(80));
    this.logger.info('[repoCase2_CreateAll] CreateAll (batch create)');

    const codes = [`REPO_BATCH_${getUID()}`, `REPO_BATCH_${getUID()}`, `REPO_BATCH_${getUID()}`];

    try {
      const result = await repo.createAll({
        data: codes.map((code, idx) => ({
          code,
          group: 'REPO_BATCH_TEST',
          dataType: DataTypes.NUMBER,
          nValue: (idx + 1) * 100,
        })),
      });

      if (result.count === 3 && result.data?.length === 3) {
        this.logger.info(
          '[repoCase2_CreateAll] PASSED | Created records | count: %d',
          result.count,
        );
      } else {
        this.logger.error('[repoCase2_CreateAll] FAILED | Expected 3 records | got: %j', result);
      }

      await repo.deleteAll({ where: { group: 'REPO_BATCH_TEST' } });
    } catch (error) {
      this.logger.error('[repoCase2_CreateAll] FAILED | Error: %j', error);
    }
  }

  // --------------------------------------------------------------------------------
  // REPO CASE 3: FindOne
  // --------------------------------------------------------------------------------
  private async repoCase3_FindOne(repo: ConfigurationRepository): Promise<void> {
    this.logger.info('-'.repeat(80));
    this.logger.info('[repoCase3_FindOne] FindOne');

    const code = `REPO_FINDONE_${getUID()}`;

    try {
      await repo.create({
        data: { code, group: 'REPO_TEST', dataType: DataTypes.NUMBER, nValue: 555 },
      });

      const result = await repo.findOne({ filter: { where: { code } } });

      if (result && result.code === code && result.nValue === 555) {
        this.logger.info(
          '[repoCase3_FindOne] PASSED | Found record | code: %s | nValue: %d',
          result.code,
          result.nValue,
        );
      } else {
        this.logger.error('[repoCase3_FindOne] FAILED | Unexpected result: %j', result);
      }

      const notFound = await repo.findOne({ filter: { where: { code: 'NON_EXISTENT_CODE' } } });
      if (notFound === null) {
        this.logger.info('[repoCase3_FindOne] PASSED | Non-existent record returns null');
      } else {
        this.logger.error('[repoCase3_FindOne] FAILED | Expected null for non-existent record');
      }

      await repo.deleteAll({ where: { code } });
    } catch (error) {
      this.logger.error('[repoCase3_FindOne] FAILED | Error: %j', error);
    }
  }

  // --------------------------------------------------------------------------------
  // REPO CASE 4: Find with filter (where, order, limit, offset)
  // --------------------------------------------------------------------------------
  private async repoCase4_FindWithFilter(repo: ConfigurationRepository): Promise<void> {
    this.logger.info('-'.repeat(80));
    this.logger.info('[repoCase4_FindWithFilter] Find with filter (where, order, limit, offset)');

    const group = `REPO_FILTER_${getUID()}`;

    try {
      await repo.createAll({
        data: [
          { code: `${group}_A`, group, dataType: DataTypes.NUMBER, nValue: 300 },
          { code: `${group}_B`, group, dataType: DataTypes.NUMBER, nValue: 100 },
          { code: `${group}_C`, group, dataType: DataTypes.NUMBER, nValue: 200 },
          { code: `${group}_D`, group, dataType: DataTypes.NUMBER, nValue: 400 },
          { code: `${group}_E`, group, dataType: DataTypes.NUMBER, nValue: 500 },
        ],
      });

      const whereResult = await repo.find({ filter: { where: { group } } });
      if (whereResult.length === 5) {
        this.logger.info(
          '[repoCase4_FindWithFilter] PASSED | Where filter | count: %d',
          whereResult.length,
        );
      } else {
        this.logger.error(
          '[repoCase4_FindWithFilter] FAILED | Expected 5 | got: %d',
          whereResult.length,
        );
      }

      const orderedAsc = await repo.find({
        filter: { where: { group }, order: ['nValue ASC'] },
      });
      if (orderedAsc[0]?.nValue === 100 && orderedAsc[4]?.nValue === 500) {
        this.logger.info('[repoCase4_FindWithFilter] PASSED | Order ASC works correctly');
      } else {
        this.logger.error(
          '[repoCase4_FindWithFilter] FAILED | Order ASC incorrect: %j',
          orderedAsc.map(r => r.nValue),
        );
      }

      const orderedDesc = await repo.find({
        filter: { where: { group }, order: ['nValue DESC'] },
      });
      if (orderedDesc[0]?.nValue === 500 && orderedDesc[4]?.nValue === 100) {
        this.logger.info('[repoCase4_FindWithFilter] PASSED | Order DESC works correctly');
      } else {
        this.logger.error(
          '[repoCase4_FindWithFilter] FAILED | Order DESC incorrect: %j',
          orderedDesc.map(r => r.nValue),
        );
      }

      const limited = await repo.find({
        filter: { where: { group }, limit: 2 },
      });
      if (limited.length === 2) {
        this.logger.info('[repoCase4_FindWithFilter] PASSED | Limit | count: %d', limited.length);
      } else {
        this.logger.error(
          '[repoCase4_FindWithFilter] FAILED | Limit expected 2 | got: %d',
          limited.length,
        );
      }

      // After ASC order: 100, 200, 300, 400, 500. Skip 2 => 300, 400, 500. Limit 2 => 300, 400
      const skipped = await repo.find({
        filter: { where: { group }, order: ['nValue ASC'], skip: 2, limit: 2 },
      });
      if (skipped.length === 2 && skipped[0]?.nValue === 300 && skipped[1]?.nValue === 400) {
        this.logger.info('[repoCase4_FindWithFilter] PASSED | Skip/offset works correctly');
      } else {
        this.logger.error(
          '[repoCase4_FindWithFilter] FAILED | Skip incorrect: %j',
          skipped.map(r => r.nValue),
        );
      }

      await repo.deleteAll({ where: { group } });
    } catch (error) {
      this.logger.error('[repoCase4_FindWithFilter] FAILED | Error: %j', error);
    }
  }

  // --------------------------------------------------------------------------------
  // REPO CASE 5: FindById
  // --------------------------------------------------------------------------------
  private async repoCase5_FindById(repo: ConfigurationRepository): Promise<void> {
    this.logger.info('-'.repeat(80));
    this.logger.info('[repoCase5_FindById] FindById');

    const code = `REPO_FINDBYID_${getUID()}`;

    try {
      const created = await repo.create({
        data: { code, group: 'REPO_TEST', dataType: DataTypes.NUMBER, nValue: 777 },
      });

      const id = created.data!.id;
      const result = await repo.findById({ id });

      if (result && result.id === id && result.code === code) {
        this.logger.info('[repoCase5_FindById] PASSED | Found by id: %s', id);
      } else {
        this.logger.error('[repoCase5_FindById] FAILED | Unexpected result: %j', result);
      }

      const notFound = await repo.findById({ id: '00000000-0000-0000-0000-000000000000' });
      if (notFound === null) {
        this.logger.info('[repoCase5_FindById] PASSED | Non-existent id returns null');
      } else {
        this.logger.error('[repoCase5_FindById] FAILED | Expected null for non-existent id');
      }

      await repo.deleteAll({ where: { code } });
    } catch (error) {
      this.logger.error('[repoCase5_FindById] FAILED | Error: %j', error);
    }
  }

  // --------------------------------------------------------------------------------
  // REPO CASE 6: UpdateById
  // --------------------------------------------------------------------------------
  private async repoCase6_UpdateById(repo: ConfigurationRepository): Promise<void> {
    this.logger.info('-'.repeat(80));
    this.logger.info('[repoCase6_UpdateById] UpdateById');

    const code = `REPO_UPDATE_${getUID()}`;

    try {
      const created = await repo.create({
        data: { code, group: 'REPO_TEST', dataType: DataTypes.NUMBER, nValue: 100 },
      });

      const id = created.data.id;
      const updateResult = await repo.updateById({
        id,
        data: { nValue: 999, description: 'Updated' },
      });

      if (updateResult.count === 1 && updateResult.data?.nValue === 999) {
        this.logger.info(
          '[repoCase6_UpdateById] PASSED | Updated record | nValue: %d',
          updateResult.data.nValue,
        );
      } else {
        this.logger.error('[repoCase6_UpdateById] FAILED | Update result: %j', updateResult);
      }

      const verified = await repo.findById({ id });
      if (verified?.nValue === 999 && verified?.description === 'Updated') {
        this.logger.info('[repoCase6_UpdateById] PASSED | Update verified in database');
      } else {
        this.logger.error('[repoCase6_UpdateById] FAILED | Update not persisted: %j', verified);
      }

      await repo.deleteAll({ where: { code } });
    } catch (error) {
      this.logger.error('[repoCase6_UpdateById] FAILED | Error: %j', error);
    }
  }

  // --------------------------------------------------------------------------------
  // REPO CASE 7: UpdateAll / UpdateBy
  // --------------------------------------------------------------------------------
  private async repoCase7_UpdateAll(repo: ConfigurationRepository): Promise<void> {
    this.logger.info('-'.repeat(80));
    this.logger.info('[repoCase7_UpdateAll] UpdateAll / UpdateBy');

    const group = `REPO_UPDATEALL_${getUID()}`;

    try {
      await repo.createAll({
        data: [
          { code: `${group}_1`, group, dataType: DataTypes.NUMBER, nValue: 100 },
          { code: `${group}_2`, group, dataType: DataTypes.NUMBER, nValue: 200 },
          { code: `${group}_3`, group, dataType: DataTypes.NUMBER, nValue: 300 },
        ],
      });

      const updateResult = await repo.updateAll({
        where: { group },
        data: { nValue: 999 },
      });

      if (updateResult.count === 3) {
        this.logger.info(
          '[repoCase7_UpdateAll] PASSED | UpdateAll affected | count: %d',
          updateResult.count,
        );
      } else {
        this.logger.error(
          '[repoCase7_UpdateAll] FAILED | Expected 3 | got: %d',
          updateResult.count,
        );
      }

      const verified = await repo.find({ filter: { where: { group } } });
      const allUpdated = verified.every(r => r.nValue === 999);
      if (allUpdated) {
        this.logger.info('[repoCase7_UpdateAll] PASSED | All records updated to nValue=999');
      } else {
        this.logger.error(
          '[repoCase7_UpdateAll] FAILED | Not all records updated: %j',
          verified.map(r => r.nValue),
        );
      }

      const updateByResult = await repo.updateBy({
        where: { group },
        data: { nValue: 888 },
      });
      if (updateByResult.count === 3) {
        this.logger.info('[repoCase7_UpdateAll] PASSED | UpdateBy works as alias for UpdateAll');
      }

      await repo.deleteAll({ where: { group } });
    } catch (error) {
      this.logger.error('[repoCase7_UpdateAll] FAILED | Error: %j', error);
    }
  }

  // --------------------------------------------------------------------------------
  // REPO CASE 8: DeleteById and DeleteAll
  // --------------------------------------------------------------------------------
  private async repoCase8_DeleteByIdAndDeleteAll(repo: ConfigurationRepository): Promise<void> {
    this.logger.info('-'.repeat(80));
    this.logger.info('[repoCase8_DeleteByIdAndDeleteAll] DeleteById and DeleteAll');

    const group = `REPO_DELETE_${getUID()}`;

    try {
      const created = await repo.createAll({
        data: [
          { code: `${group}_1`, group, dataType: DataTypes.NUMBER, nValue: 100 },
          { code: `${group}_2`, group, dataType: DataTypes.NUMBER, nValue: 200 },
          { code: `${group}_3`, group, dataType: DataTypes.NUMBER, nValue: 300 },
        ],
      });

      const firstId = created.data![0].id;
      const deleteByIdResult = await repo.deleteById({ id: firstId });

      if (deleteByIdResult.count === 1 && deleteByIdResult.data?.id === firstId) {
        this.logger.info(
          '[repoCase8_DeleteByIdAndDeleteAll] PASSED | DeleteById removed record | id: %s',
          firstId,
        );
      } else {
        this.logger.error(
          '[repoCase8_DeleteByIdAndDeleteAll] FAILED | DeleteById result: %j',
          deleteByIdResult,
        );
      }

      const verifyDeleted = await repo.findById({ id: firstId });
      if (verifyDeleted === null) {
        this.logger.info(
          '[repoCase8_DeleteByIdAndDeleteAll] PASSED | DeleteById verified (record not found)',
        );
      } else {
        this.logger.error(
          '[repoCase8_DeleteByIdAndDeleteAll] FAILED | Record still exists after DeleteById',
        );
      }

      const deleteAllResult = await repo.deleteAll({ where: { group } });
      if (deleteAllResult.count === 2) {
        this.logger.info(
          '[repoCase8_DeleteByIdAndDeleteAll] PASSED | DeleteAll removed remaining records | count: %d',
          deleteAllResult.count,
        );
      } else {
        this.logger.error(
          '[repoCase8_DeleteByIdAndDeleteAll] FAILED | DeleteAll expected 2 | got: %d',
          deleteAllResult.count,
        );
      }

      const remaining = await repo.find({ filter: { where: { group } } });
      if (remaining.length === 0) {
        this.logger.info('[repoCase8_DeleteByIdAndDeleteAll] PASSED | All records deleted');
      } else {
        this.logger.error(
          '[repoCase8_DeleteByIdAndDeleteAll] FAILED | Records still remain | count: %d',
          remaining.length,
        );
      }
    } catch (error) {
      this.logger.error('[repoCase8_DeleteByIdAndDeleteAll] FAILED | Error: %j', error);
    }
  }

  // --------------------------------------------------------------------------------
  // Transaction Test Cases
  // --------------------------------------------------------------------------------
  async runTransactionTests(repo: ConfigurationRepository): Promise<void> {
    this.logger.info('='.repeat(80));
    this.logger.info('[Transaction Tests] Starting transaction test cases...');
    this.logger.info('='.repeat(80));

    await this.testCase1_CommitSuccess(repo);
    await this.testCase2_RollbackOnError(repo);
    await this.testCase3_RollbackExplicit(repo);
    await this.testCase4_ReadWithinTransaction(repo);
    await this.testCase5_UpdateAndDeleteInTransaction(repo);
    await this.testCase6_UseInactiveTransactionAfterCommit(repo);
    await this.testCase7_UseInactiveTransactionAfterRollback(repo);
    await this.testCase8_IsolationLevelReadCommitted(repo);
    await this.testCase9_IsolationLevelSerializable(repo);
    await this.testCase10_CreateAllInTransaction(repo);

    this.logger.info('='.repeat(80));
    this.logger.info('[Transaction Tests] All test cases completed!');
    this.logger.info('='.repeat(80));
  }

  // --------------------------------------------------------------------------------
  // CASE 1: Commit Success - Multiple creates should persist after commit
  // --------------------------------------------------------------------------------
  private async testCase1_CommitSuccess(repo: ConfigurationRepository): Promise<void> {
    this.logger.info('-'.repeat(80));
    this.logger.info('[CASE 1] Commit Success - Multiple creates should persist after commit');

    const code1 = `TX_COMMIT_${getUID()}`;
    const code2 = `TX_COMMIT_${getUID()}`;
    const transaction = await repo.beginTransaction();

    try {
      await repo.create({
        data: { code: code1, group: 'TX_TEST', dataType: DataTypes.NUMBER, nValue: 100 },
        options: { transaction },
      });
      await repo.create({
        data: { code: code2, group: 'TX_TEST', dataType: DataTypes.NUMBER, nValue: 200 },
        options: { transaction },
      });

      await transaction.commit();
      this.logger.info('[CASE 1] Transaction committed');

      // Verify data persisted
      const result1 = await repo.findOne({ filter: { where: { code: code1 } } });
      const result2 = await repo.findOne({ filter: { where: { code: code2 } } });

      if (result1 && result2) {
        this.logger.info('[CASE 1] PASSED - Both records persisted after commit');
      } else {
        this.logger.error('[CASE 1] FAILED - Records not found after commit');
      }

      // Cleanup
      await repo.deleteAll({ where: { group: 'TX_TEST' } });
    } catch (error) {
      await transaction.rollback();
      this.logger.error('[CASE 1] FAILED with error: %o', error);
    }
  }

  // --------------------------------------------------------------------------------
  // CASE 2: Rollback on Error - Data should NOT persist after rollback
  // --------------------------------------------------------------------------------
  private async testCase2_RollbackOnError(repo: ConfigurationRepository): Promise<void> {
    this.logger.info('-'.repeat(80));
    this.logger.info('[CASE 2] Rollback on Error - Data should NOT persist after rollback');

    const code1 = `TX_ROLLBACK_ERR_${getUID()}`;
    const transaction = await repo.beginTransaction();

    try {
      await repo.create({
        data: { code: code1, group: 'TX_TEST', dataType: DataTypes.NUMBER, nValue: 100 },
        options: { transaction },
      });

      // Simulate an error by creating duplicate (unique constraint violation)
      await repo.create({
        data: { code: code1, group: 'TX_TEST', dataType: DataTypes.NUMBER, nValue: 200 },
        options: { transaction },
      });

      await transaction.commit();
      this.logger.error('[CASE 2] FAILED - Should have thrown error on duplicate');
    } catch (error) {
      await transaction.rollback();
      this.logger.info(
        '[CASE 2] Error caught, transaction rolled back: %s',
        (error as Error).message,
      );

      // Verify data NOT persisted
      const result = await repo.findOne({ filter: { where: { code: code1 } } });
      if (!result) {
        this.logger.info('[CASE 2] PASSED - Record NOT persisted after rollback');
      } else {
        this.logger.error('[CASE 2] FAILED - Record should not exist after rollback');
        await repo.deleteAll({ where: { code: code1 } });
      }
    }
  }

  // --------------------------------------------------------------------------------
  // CASE 3: Explicit Rollback - Manual rollback without error
  // --------------------------------------------------------------------------------
  private async testCase3_RollbackExplicit(repo: ConfigurationRepository): Promise<void> {
    this.logger.info('-'.repeat(80));
    this.logger.info('[CASE 3] Explicit Rollback - Manual rollback discards changes');

    const code = `TX_EXPLICIT_ROLLBACK_${getUID()}`;
    const transaction = await repo.beginTransaction();

    try {
      await repo.create({
        data: { code, group: 'TX_TEST', dataType: DataTypes.NUMBER, nValue: 12345 },
        options: { transaction },
      });

      // Explicitly rollback without any error
      await transaction.rollback();
      this.logger.info('[CASE 3] Transaction explicitly rolled back');

      // Verify data NOT persisted
      const result = await repo.findOne({ filter: { where: { code } } });
      if (!result) {
        this.logger.info('[CASE 3] PASSED - Record NOT persisted after explicit rollback');
      } else {
        this.logger.error('[CASE 3] FAILED - Record should not exist after rollback');
        await repo.deleteAll({ where: { code } });
      }
    } catch (error) {
      this.logger.error('[CASE 3] FAILED with unexpected error: %o', error);
    }
  }

  // --------------------------------------------------------------------------------
  // CASE 4: Read within Transaction - Should see uncommitted changes
  // --------------------------------------------------------------------------------
  private async testCase4_ReadWithinTransaction(repo: ConfigurationRepository): Promise<void> {
    this.logger.info('-'.repeat(80));
    this.logger.info('[CASE 4] Read within Transaction - Should see uncommitted changes');

    const code = `TX_READ_UNCOMMITTED_${getUID()}`;
    const transaction = await repo.beginTransaction();

    try {
      await repo.create({
        data: { code, group: 'TX_TEST', dataType: DataTypes.NUMBER, nValue: 999 },
        options: { transaction },
      });

      // Read within same transaction - should see uncommitted data
      const withinTx = await repo.findOne({
        filter: { where: { code } },
        options: { transaction },
      });

      // Read outside transaction - should NOT see uncommitted data
      const outsideTx = await repo.findOne({
        filter: { where: { code } },
      });

      if (withinTx && !outsideTx) {
        this.logger.info('[CASE 4] PASSED - Within tx sees data, outside tx does not');
      } else {
        this.logger.error('[CASE 4] FAILED - withinTx: %o, outsideTx: %o', withinTx, outsideTx);
      }

      await transaction.rollback();
    } catch (error) {
      await transaction.rollback();
      this.logger.error('[CASE 4] FAILED with error: %o', error);
    }
  }

  // --------------------------------------------------------------------------------
  // CASE 5: Update and Delete in Transaction
  // --------------------------------------------------------------------------------
  private async testCase5_UpdateAndDeleteInTransaction(
    repo: ConfigurationRepository,
  ): Promise<void> {
    this.logger.info('-'.repeat(80));
    this.logger.info('[CASE 5] Update and Delete in Transaction');

    const code1 = `TX_UPDATE_${getUID()}`;
    const code2 = `TX_DELETE_${getUID()}`;

    // First create records outside transaction
    const created1 = await repo.create({
      data: { code: code1, group: 'TX_TEST', dataType: DataTypes.NUMBER, nValue: 100 },
    });
    const created2 = await repo.create({
      data: { code: code2, group: 'TX_TEST', dataType: DataTypes.NUMBER, nValue: 200 },
    });

    const transaction = await repo.beginTransaction();

    try {
      // Update within transaction
      await repo.updateById({
        id: created1.data!.id,
        data: { nValue: 999 },
        options: { transaction },
      });

      // Delete within transaction
      await repo.deleteById({
        id: created2.data!.id,
        options: { transaction },
      });

      await transaction.commit();

      // Verify changes
      const updated = await repo.findById({ id: created1.data!.id });
      const deleted = await repo.findById({ id: created2.data!.id });

      if (updated?.nValue === 999 && !deleted) {
        this.logger.info('[CASE 5] PASSED - Update and delete persisted after commit');
      } else {
        this.logger.error('[CASE 5] FAILED - updated: %o, deleted: %o', updated, deleted);
      }

      // Cleanup
      await repo.deleteAll({ where: { code: code1 } });
    } catch (error) {
      await transaction.rollback();
      this.logger.error('[CASE 5] FAILED with error: %o', error);
      await repo.deleteAll({ where: { or: [{ code: code1 }, { code: code2 }] } });
    }
  }

  // --------------------------------------------------------------------------------
  // CASE 6: Using inactive transaction after commit should throw error
  // --------------------------------------------------------------------------------
  private async testCase6_UseInactiveTransactionAfterCommit(
    repo: ConfigurationRepository,
  ): Promise<void> {
    this.logger.info('-'.repeat(80));
    this.logger.info('[CASE 6] Using inactive transaction after commit should throw error');

    const transaction = await repo.beginTransaction();
    await transaction.commit();

    try {
      await repo.create({
        data: {
          code: `TX_INACTIVE_${getUID()}`,
          group: 'TX_TEST',
          dataType: DataTypes.NUMBER,
          nValue: 999,
        },
        options: { transaction },
      });

      this.logger.error('[CASE 6] FAILED - Should have thrown error for inactive transaction');
    } catch (error) {
      const errorMessage = (error as Error).message;
      if (errorMessage.includes('no longer active') || errorMessage.includes('Transaction')) {
        this.logger.info(
          '[CASE 6] PASSED - Error thrown for inactive transaction: %s',
          errorMessage,
        );
      } else {
        this.logger.error('[CASE 6] FAILED - Unexpected error: %s', errorMessage);
      }
    }
  }

  // --------------------------------------------------------------------------------
  // CASE 7: Using inactive transaction after rollback should throw error
  // --------------------------------------------------------------------------------
  private async testCase7_UseInactiveTransactionAfterRollback(
    repo: ConfigurationRepository,
  ): Promise<void> {
    this.logger.info('-'.repeat(80));
    this.logger.info('[CASE 7] Using inactive transaction after rollback should throw error');

    const transaction = await repo.beginTransaction();
    await transaction.rollback();

    try {
      await repo.create({
        data: {
          code: `TX_INACTIVE_RB_${getUID()}`,
          group: 'TX_TEST',
          dataType: DataTypes.NUMBER,
          nValue: 999,
        },
        options: { transaction },
      });

      this.logger.error('[CASE 7] FAILED - Should have thrown error for inactive transaction');
    } catch (error) {
      const errorMessage = (error as Error).message;
      if (errorMessage.includes('no longer active') || errorMessage.includes('Transaction')) {
        this.logger.info(
          '[CASE 7] PASSED - Error thrown for inactive transaction: %s',
          errorMessage,
        );
      } else {
        this.logger.error('[CASE 7] FAILED - Unexpected error: %s', errorMessage);
      }
    }
  }

  // --------------------------------------------------------------------------------
  // CASE 8: Isolation Level - READ COMMITTED (default)
  // --------------------------------------------------------------------------------
  private async testCase8_IsolationLevelReadCommitted(
    repo: ConfigurationRepository,
  ): Promise<void> {
    this.logger.info('-'.repeat(80));
    this.logger.info('[CASE 8] Isolation Level - READ COMMITTED (default)');

    const transaction = await repo.beginTransaction({
      isolationLevel: IsolationLevels.READ_COMMITTED,
    });

    try {
      if (transaction.isolationLevel === IsolationLevels.READ_COMMITTED) {
        this.logger.info('[CASE 8] PASSED - Transaction created with READ COMMITTED isolation');
      } else {
        this.logger.error(
          '[CASE 8] FAILED - Expected READ COMMITTED, got: %s',
          transaction.isolationLevel,
        );
      }
      await transaction.rollback();
    } catch (error) {
      await transaction.rollback();
      this.logger.error('[CASE 8] FAILED with error: %o', error);
    }
  }

  // --------------------------------------------------------------------------------
  // CASE 9: Isolation Level - SERIALIZABLE
  // --------------------------------------------------------------------------------
  private async testCase9_IsolationLevelSerializable(repo: ConfigurationRepository): Promise<void> {
    this.logger.info('-'.repeat(80));
    this.logger.info('[CASE 9] Isolation Level - SERIALIZABLE');

    const code = `TX_SERIALIZABLE_${getUID()}`;
    const transaction = await repo.beginTransaction({
      isolationLevel: IsolationLevels.SERIALIZABLE,
    });

    try {
      if (transaction.isolationLevel === IsolationLevels.SERIALIZABLE) {
        this.logger.info('[CASE 9] Transaction created with SERIALIZABLE isolation');
      } else {
        this.logger.error('[CASE 9] Wrong isolation level: %s', transaction.isolationLevel);
      }

      await repo.create({
        data: { code, group: 'TX_TEST', dataType: DataTypes.NUMBER, nValue: 777 },
        options: { transaction },
      });

      await transaction.commit();

      const result = await repo.findOne({ filter: { where: { code } } });
      if (result) {
        this.logger.info('[CASE 9] PASSED - SERIALIZABLE transaction committed successfully');
        await repo.deleteAll({ where: { code } });
      } else {
        this.logger.error('[CASE 9] FAILED - Record not found after SERIALIZABLE commit');
      }
    } catch (error) {
      await transaction.rollback();
      this.logger.error('[CASE 9] FAILED with error: %o', error);
    }
  }

  // --------------------------------------------------------------------------------
  // CASE 10: CreateAll in Transaction
  // --------------------------------------------------------------------------------
  private async testCase10_CreateAllInTransaction(repo: ConfigurationRepository): Promise<void> {
    this.logger.info('-'.repeat(80));
    this.logger.info('[CASE 10] CreateAll in Transaction');

    const codes = [`TX_BATCH_${getUID()}`, `TX_BATCH_${getUID()}`, `TX_BATCH_${getUID()}`];
    const transaction = await repo.beginTransaction();

    try {
      const batchData = codes.map((code, idx) => ({
        code,
        group: 'TX_BATCH_TEST',
        dataType: DataTypes.NUMBER,
        nValue: (idx + 1) * 100,
      }));

      await repo.createAll({
        data: batchData,
        options: { transaction },
      });

      await transaction.commit();

      // Verify all records persisted
      const results = await repo.find({
        filter: { where: { group: 'TX_BATCH_TEST' } },
      });

      if (results.length === 3) {
        this.logger.info('[CASE 10] PASSED - All 3 batch records persisted after commit');
      } else {
        this.logger.error('[CASE 10] FAILED - Expected 3 records, got: %d', results.length);
      }

      // Cleanup
      await repo.deleteAll({ where: { group: 'TX_BATCH_TEST' } });
    } catch (error) {
      await transaction.rollback();
      this.logger.error('[CASE 10] FAILED with error: %o', error);
    }
  }

  // --------------------------------------------------------------------------------
  // Inclusion Test Cases (Many-to-Many Relationship)
  // --------------------------------------------------------------------------------
  private async runInclusionTests(
    productRepo: ProductRepository,
    saleChannelRepo: SaleChannelRepository,
    saleChannelProductRepo: SaleChannelProductRepository,
  ): Promise<void> {
    this.logger.info('='.repeat(80));
    this.logger.info('[Inclusion Tests] Starting inclusion test cases (many-to-many)');
    this.logger.info('='.repeat(80));

    await this.inclusionCase1_SetupAndBasicInclude(
      productRepo,
      saleChannelRepo,
      saleChannelProductRepo,
    );
    await this.inclusionCase2_ProductWithSaleChannels(
      productRepo,
      saleChannelRepo,
      saleChannelProductRepo,
    );
    await this.inclusionCase3_SaleChannelWithProducts(
      productRepo,
      saleChannelRepo,
      saleChannelProductRepo,
    );
    await this.inclusionCase4_JunctionTableWithBothRelations(
      productRepo,
      saleChannelRepo,
      saleChannelProductRepo,
    );
    await this.inclusionCase5_NestedInclusion(productRepo, saleChannelRepo, saleChannelProductRepo);
    await this.inclusionCase6_Cleanup(productRepo, saleChannelRepo, saleChannelProductRepo);

    this.logger.info('='.repeat(80));
    this.logger.info('[Inclusion Tests] All inclusion test cases completed!');
    this.logger.info('='.repeat(80));
  }

  // --------------------------------------------------------------------------------
  // INCLUSION CASE 1: Setup test data and basic include
  // --------------------------------------------------------------------------------
  private async inclusionCase1_SetupAndBasicInclude(
    productRepo: ProductRepository,
    saleChannelRepo: SaleChannelRepository,
    saleChannelProductRepo: SaleChannelProductRepository,
  ): Promise<void> {
    this.logger.info('-'.repeat(80));
    this.logger.info('[INCLUSION 1] Setup test data and basic include');

    try {
      // Create products
      const product1 = await productRepo.create({
        data: {
          code: `PROD_${getUID()}`,
          name: 'Product A',
          description: 'First test product',
          price: 100,
        },
      });
      const product2 = await productRepo.create({
        data: {
          code: `PROD_${getUID()}`,
          name: 'Product B',
          description: 'Second test product',
          price: 200,
        },
      });
      const product3 = await productRepo.create({
        data: {
          code: `PROD_${getUID()}`,
          name: 'Product C',
          description: 'Third test product',
          price: 300,
        },
      });

      // Create sale channels
      const channel1 = await saleChannelRepo.create({
        data: {
          code: `CHANNEL_${getUID()}`,
          name: 'Online Store',
          description: 'E-commerce platform',
          isActive: true,
        },
      });
      const channel2 = await saleChannelRepo.create({
        data: {
          code: `CHANNEL_${getUID()}`,
          name: 'Retail Store',
          description: 'Physical retail locations',
          isActive: true,
        },
      });
      const channel3 = await saleChannelRepo.create({
        data: {
          code: `CHANNEL_${getUID()}`,
          name: 'Wholesale',
          description: 'B2B wholesale channel',
          isActive: false,
        },
      });

      // Create junction table entries (many-to-many relationships)
      // Product A -> Online Store, Retail Store
      // Product B -> Online Store, Wholesale
      // Product C -> Retail Store, Wholesale
      await saleChannelProductRepo.createAll({
        data: [
          { productId: product1.data.id, saleChannelId: channel1.data.id },
          { productId: product1.data.id, saleChannelId: channel2.data.id },
          { productId: product2.data.id, saleChannelId: channel1.data.id },
          { productId: product2.data.id, saleChannelId: channel3.data.id },
          { productId: product3.data.id, saleChannelId: channel2.data.id },
          { productId: product3.data.id, saleChannelId: channel3.data.id },
        ],
      });

      this.logger.info('[INCLUSION 1] PASSED | Created 3 products, 3 channels, 6 junction records');
    } catch (error) {
      this.logger.error('[INCLUSION 1] FAILED | Error: %s', (error as Error).message);
    }
  }

  // --------------------------------------------------------------------------------
  // INCLUSION CASE 2: Find Product with its SaleChannels (through junction table)
  // --------------------------------------------------------------------------------
  private async inclusionCase2_ProductWithSaleChannels(
    productRepo: ProductRepository,
    _saleChannelRepo: SaleChannelRepository,
    _saleChannelProductRepo: SaleChannelProductRepository,
  ): Promise<void> {
    this.logger.info('-'.repeat(80));
    this.logger.info('[INCLUSION 2] Find Product with its SaleChannels');

    try {
      // Find Product A with its sale channels
      const productA = await productRepo.findOne({
        filter: {
          where: { name: 'Product A' },
          include: [
            {
              relation: 'saleChannelProducts',
              scope: {
                include: [{ relation: 'saleChannel' }],
              },
            },
          ],
        },
      });

      if (!productA) {
        this.logger.error('[INCLUSION 2] FAILED | Product A not found');
        return;
      }

      const saleChannelProducts = (productA as any).saleChannelProducts;
      if (saleChannelProducts && saleChannelProducts.length === 2) {
        const channelNames = saleChannelProducts.map((scp: any) => scp.saleChannel?.name);
        this.logger.info(
          '[INCLUSION 2] PASSED | Product A has 2 channels | Channels: %j',
          channelNames,
        );
      } else {
        this.logger.error(
          '[INCLUSION 2] FAILED | Expected 2 saleChannelProducts | got: %d',
          saleChannelProducts?.length ?? 0,
        );
      }
    } catch (error) {
      this.logger.error('[INCLUSION 2] FAILED | Error: %s', (error as Error).message);
    }
  }

  // --------------------------------------------------------------------------------
  // INCLUSION CASE 3: Find SaleChannel with its Products (through junction table)
  // --------------------------------------------------------------------------------
  private async inclusionCase3_SaleChannelWithProducts(
    _productRepo: ProductRepository,
    saleChannelRepo: SaleChannelRepository,
    _saleChannelProductRepo: SaleChannelProductRepository,
  ): Promise<void> {
    this.logger.info('-'.repeat(80));
    this.logger.info('[INCLUSION 3] Find SaleChannel with its Products');

    try {
      // Find Online Store with its products
      const onlineStore = await saleChannelRepo.findOne({
        filter: {
          where: { name: 'Online Store' },
          include: [
            {
              relation: 'saleChannelProducts',
              scope: {
                include: [{ relation: 'product' }],
              },
            },
          ],
        },
      });

      if (!onlineStore) {
        this.logger.error('[INCLUSION 3] FAILED | Online Store not found');
        return;
      }

      const saleChannelProducts = (onlineStore as any).saleChannelProducts;
      if (saleChannelProducts && saleChannelProducts.length === 2) {
        const productNames = saleChannelProducts.map((scp: any) => scp.product?.name);
        this.logger.info(
          '[INCLUSION 3] PASSED | Online Store has 2 products | Products: %j',
          productNames,
        );
      } else {
        this.logger.error(
          '[INCLUSION 3] FAILED | Expected 2 saleChannelProducts | got: %d',
          saleChannelProducts?.length ?? 0,
        );
      }
    } catch (error) {
      this.logger.error('[INCLUSION 3] FAILED | Error: %s', (error as Error).message);
    }
  }

  // --------------------------------------------------------------------------------
  // INCLUSION CASE 4: Find junction table with both relations
  // --------------------------------------------------------------------------------
  private async inclusionCase4_JunctionTableWithBothRelations(
    _productRepo: ProductRepository,
    _saleChannelRepo: SaleChannelRepository,
    saleChannelProductRepo: SaleChannelProductRepository,
  ): Promise<void> {
    this.logger.info('-'.repeat(80));
    this.logger.info('[INCLUSION 4] Find junction table with both relations');

    try {
      const allRelations = await saleChannelProductRepo.find({
        filter: {
          include: [{ relation: 'product' }, { relation: 'saleChannel' }],
        },
      });

      if (allRelations.length === 6) {
        const withBothRelations = allRelations.filter(
          (r: any) => r.product && r.saleChannel,
        ).length;

        if (withBothRelations === 6) {
          this.logger.info(
            '[INCLUSION 4] PASSED | All 6 junction records have both product and saleChannel',
          );
        } else {
          this.logger.error(
            '[INCLUSION 4] FAILED | Only %d of 6 have both relations',
            withBothRelations,
          );
        }
      } else {
        this.logger.error(
          '[INCLUSION 4] FAILED | Expected 6 junction records | got: %d',
          allRelations.length,
        );
      }
    } catch (error) {
      this.logger.error('[INCLUSION 4] FAILED | Error: %s', (error as Error).message);
    }
  }

  // --------------------------------------------------------------------------------
  // INCLUSION CASE 5: Nested inclusion - find all products with channels
  // --------------------------------------------------------------------------------
  private async inclusionCase5_NestedInclusion(
    productRepo: ProductRepository,
    _saleChannelRepo: SaleChannelRepository,
    _saleChannelProductRepo: SaleChannelProductRepository,
  ): Promise<void> {
    this.logger.info('-'.repeat(80));
    this.logger.info('[INCLUSION 5] Nested inclusion - find all products with channels');

    try {
      const allProducts = await productRepo.find({
        filter: {
          include: [
            {
              relation: 'saleChannelProducts',
              scope: {
                include: [{ relation: 'saleChannel' }],
              },
            },
          ],
        },
      });

      if (allProducts.length === 3) {
        let totalChannels = 0;
        for (const product of allProducts) {
          const scp = (product as any).saleChannelProducts || [];
          totalChannels += scp.length;
        }

        if (totalChannels === 6) {
          this.logger.info(
            '[INCLUSION 5] PASSED | Found 3 products with total 6 channel associations',
          );
        } else {
          this.logger.error(
            '[INCLUSION 5] FAILED | Expected 6 total associations | got: %d',
            totalChannels,
          );
        }
      } else {
        this.logger.error(
          '[INCLUSION 5] FAILED | Expected 3 products | got: %d',
          allProducts.length,
        );
      }
    } catch (error) {
      this.logger.error('[INCLUSION 5] FAILED | Error: %s', (error as Error).message);
    }
  }

  // --------------------------------------------------------------------------------
  // INCLUSION CASE 6: Cleanup all test data
  // --------------------------------------------------------------------------------
  private async inclusionCase6_Cleanup(
    productRepo: ProductRepository,
    saleChannelRepo: SaleChannelRepository,
    saleChannelProductRepo: SaleChannelProductRepository,
  ): Promise<void> {
    this.logger.info('-'.repeat(80));
    this.logger.info('[INCLUSION 6] Cleanup all test data');

    try {
      // Delete in correct order (junction table first due to foreign keys)
      const deletedJunction = await saleChannelProductRepo.deleteAll({
        where: {},
        options: { force: true },
      });
      const deletedProducts = await productRepo.deleteAll({
        where: {},
        options: { force: true },
      });
      const deletedChannels = await saleChannelRepo.deleteAll({
        where: {},
        options: { force: true },
      });

      this.logger.info(
        '[INCLUSION 6] PASSED | Cleaned up | Junction: %d | Products: %d | Channels: %d',
        deletedJunction.count,
        deletedProducts.count,
        deletedChannels.count,
      );
    } catch (error) {
      this.logger.error('[INCLUSION 6] FAILED | Error: %s', (error as Error).message);
    }
  }
}
