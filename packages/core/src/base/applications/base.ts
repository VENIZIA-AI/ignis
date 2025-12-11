import { BindingNamespaces } from '@/common/bindings';
import { RequestTrackerComponent } from '@/components';
import {
  AnyObject,
  Binding,
  BindingKeys,
  BindingScopes,
  BindingValueTypes,
  executeWithPerformanceMeasure,
  getError,
  HTTP,
  IConfigurable,
  MetadataRegistry,
  RuntimeModules,
  TClass,
} from '@venizia/ignis-helpers';
import isEmpty from 'lodash/isEmpty';
import { BaseComponent } from '../components';
import { BaseController } from '../controllers';
import { IDataSource } from '../datasources';
import { appErrorHandler, emojiFavicon, notFoundHandler, requestNormalize } from '../middlewares';
import { IRepository } from '../repositories';
import { IService } from '../services';
import { AbstractApplication } from './abstract';
import { IRestApplication } from './types';

const {
  NODE_ENV,
  RUN_MODE,
  ALLOW_EMPTY_ENV_VALUE = false,
  APPLICATION_ENV_PREFIX = 'APP_ENV',

  APP_ENV_APPLICATION_NAME = 'PNT',
  APP_ENV_APPLICATION_TIMEZONE = 'Asia/Ho_Chi_Minh',
  APP_ENV_DS_MIGRATION = 'postgres',
  APP_ENV_DS_AUTHORIZE = 'postgres',
  APP_ENV_LOGGER_FOLDER_PATH = './',
} = process.env;

// ------------------------------------------------------------------------------
export abstract class BaseApplication extends AbstractApplication implements IRestApplication {
  protected normalizePath(...segments: string[]): string {
    const joined = segments.join('/').replace(/\/+/g, '/').replace(/\/$/, '');
    return joined || '/';
  }

  // ------------------------------------------------------------------------------
  component<T extends BaseComponent, O extends AnyObject = any>(
    ctor: TClass<T>,
    _args?: O,
  ): Binding<T> {
    return this.bind<T>({
      key: BindingKeys.build({
        namespace: BindingNamespaces.COMPONENT,
        key: ctor.name,
      }),
    })
      .toClass(ctor)
      .setScope(BindingScopes.SINGLETON);
  }

  async registerComponents() {
    await executeWithPerformanceMeasure({
      logger: this.logger,
      scope: this.registerComponents.name,
      description: 'Register application components',
      task: async () => {
        const bindings = this.findByTag({ tag: 'components' });
        for (const binding of bindings) {
          const instance = this.get<IConfigurable>({ key: binding.key, isOptional: false });
          if (!instance) {
            this.logger.debug(
              '[registerComponents] No binding instance | Ignore registering component | key: %s',
              binding.key,
            );
            continue;
          }

          await instance.configure();
        }
      },
    });
  }

  // ------------------------------------------------------------------------------
  controller<T>(ctor: TClass<T>): Binding<T> {
    return this.bind<T>({
      key: BindingKeys.build({
        namespace: BindingNamespaces.CONTROLLER,
        key: ctor.name,
      }),
    }).toClass(ctor);
  }

  async registerControllers() {
    await executeWithPerformanceMeasure({
      logger: this.logger,
      description: 'Register application controllers',
      scope: this.registerControllers.name,
      task: async () => {
        const router = this.getRootRouter();

        const bindings = this.findByTag({ tag: 'controllers' });
        for (const binding of bindings) {
          const controllerMetadata = MetadataRegistry.getInstance().getControllerMetadata({
            target: binding.getBindingMeta({ type: BindingValueTypes.CLASS }),
          });

          if (!controllerMetadata?.path || isEmpty(controllerMetadata?.path)) {
            throw getError({
              statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
              message: `[registerControllers] key: '${binding.key}' | Invalid controller metadata, 'path' is required for controller metadata`,
            });
          }

          const instance = this.get<BaseController>({ key: binding.key, isOptional: false });
          if (!instance) {
            this.logger.debug(
              '[registerControllers] No binding instance | Ignore registering controller | key: %s',
              binding.key,
            );
            continue;
          }

          await instance.configure();

          router.route(controllerMetadata.path, instance.getRouter());
        }
      },
    });
  }

  // ------------------------------------------------------------------------------
  service<T extends IService>(ctor: TClass<T>): Binding<T> {
    return this.bind<T>({
      key: BindingKeys.build({
        namespace: BindingNamespaces.SERVICE,
        key: ctor.name,
      }),
    }).toClass(ctor);
  }

  // ------------------------------------------------------------------------------
  repository<T extends IRepository<any>>(ctor: TClass<T>): Binding<T> {
    return this.bind<T>({
      key: BindingKeys.build({
        namespace: BindingNamespaces.REPOSITORY,
        key: ctor.name,
      }),
    }).toClass(ctor);
  }

  // ------------------------------------------------------------------------------
  dataSource<T extends IDataSource<any>>(ctor: TClass<T>): Binding<T> {
    return this.bind<T>({
      key: BindingKeys.build({
        namespace: BindingNamespaces.DATASOURCE,
        key: ctor.name,
      }),
    })
      .toClass(ctor)
      .setScope(BindingScopes.SINGLETON);
  }

  async registerDataSources() {
    await executeWithPerformanceMeasure({
      logger: this.logger,
      scope: this.registerDataSources.name,
      description: 'Register application data sources',
      task: async () => {
        const bindings = this.findByTag({ tag: 'datasources' });
        for (const binding of bindings) {
          const instance = this.get<IConfigurable>({ key: binding.key, isOptional: false });
          if (!instance) {
            this.logger.debug(
              '[registerDataSources] No binding instance | Ignore registering datasource | key: %s',
              binding.key,
            );
            continue;
          }

          await instance.configure();
        }
      },
    });
  }

  // ------------------------------------------------------------------------------
  static(opts: { restPath?: string; folderPath: string }) {
    const { restPath = '*', folderPath } = opts;
    const server = this.getServer();

    switch (this.server.runtime) {
      case RuntimeModules.BUN: {
        const { serveStatic } = require('hono/bun');
        server.use(restPath, serveStatic({ root: folderPath }));
        break;
      }
      case RuntimeModules.NODE: {
        try {
          const { serveStatic } = require('@hono/node-server/serve-static');
          server.use(restPath, serveStatic({ root: folderPath }));
        } catch (error) {
          this.logger.error('[static] Failed to serve static file | Error: %s', error);
          throw getError({
            message: `[static] @hono/node-server is required for Node.js runtime. Please install '@hono/node-server'`,
          });
        }
        break;
      }
      default: {
        throw getError({
          message: '[static] Invalid server runtime to config static loader!',
        });
      }
    }

    this.logger.debug(
      '[static] Registered static files | runtime: %s | path: %s | folder: %s',
      this.server.runtime,
      restPath,
      folderPath,
    );
    return this;
  }

  // ------------------------------------------------------------------------------
  protected printStartUpInfo(opts: { scope: string }) {
    const { scope } = opts;
    this.logger.info(
      '[%s] ------------------------------------------------------------------------',
      scope,
    );
    this.logger.info(
      '[%s] Starting application... | Name: %s | Env: %s | Runtime: %s',
      scope,
      APP_ENV_APPLICATION_NAME,
      NODE_ENV,
      this.server.runtime,
    );
    this.logger.info(
      '[%s] AllowEmptyEnv: %s | Prefix: %s',
      scope,
      ALLOW_EMPTY_ENV_VALUE,
      APPLICATION_ENV_PREFIX,
    );
    this.logger.info('[%s] RunMode: %s', scope, RUN_MODE);
    this.logger.info('[%s] Timezone: %s', scope, APP_ENV_APPLICATION_TIMEZONE);
    this.logger.info('[%s] LogPath: %s', scope, APP_ENV_LOGGER_FOLDER_PATH);
    this.logger.info(
      '[%s] Datasource | Migration: %s | Authorize: %s',
      scope,
      APP_ENV_DS_MIGRATION,
      APP_ENV_DS_AUTHORIZE,
    );
    this.logger.info(
      '[%s] ------------------------------------------------------------------------',
      scope,
    );
  }

  // ------------------------------------------------------------------------------
  protected async registerDefaultMiddlewares() {
    await executeWithPerformanceMeasure({
      logger: this.logger,
      scope: this.registerDefaultMiddlewares.name,
      description: 'Register default application server handler',
      task: () => {
        const server = this.getServer();

        // Assign requestId for every single request from client
        this.component(RequestTrackerComponent);

        // NOTE: Bug from Bun + Hono, this middleware aims to parse needed body for continue handling request
        // Refer: https://github.com/honojs/middleware/issues/81
        server.use(requestNormalize());

        server.use(emojiFavicon({ icon: this.configs.favicon ?? '🔥' }));
        server.notFound(notFoundHandler({ logger: this.logger }));
        server.onError(appErrorHandler({ logger: this.logger }));
      },
    });
  }

  // ------------------------------------------------------------------------------
  override async initialize() {
    this.printStartUpInfo({ scope: this.initialize.name });
    this.validateEnvs();

    await this.registerDefaultMiddlewares();
    this.staticConfigure();

    await this.preConfigure();

    await this.registerDataSources();
    await this.registerComponents();
    await this.registerControllers();

    // NOTE: Do not binding any new datasource(s), component(s) or controller(s) in postConfigure
    // It will not be registered into application automatically
    // In case, register processes are required to be in postConfigure, end-users have to init binding and call configure manually
    // Refer registerDataSources, registerComponents, or registerControllers to know how to load binding
    await this.postConfigure();
  }
}
