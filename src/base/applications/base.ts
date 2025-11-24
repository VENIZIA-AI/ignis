import { BindingKeys, BindingNamespaces } from '@/common/bindings';
import { HTTP, RuntimeModules } from '@/common/constants';
import { AnyObject, IClass } from '@/common/types';
import { RequestTrackerComponent } from '@/components';
import { ApplicationError, getError } from '@/helpers/error';
import { BindingScopes, BindingValueTypes, MetadataRegistry } from '@/helpers/inversion';
import { executeWithPerformanceMeasure } from '@/utilities';
import isEmpty from 'lodash/isEmpty';
import { BaseComponent } from '../components';
import { BaseController } from '../controllers';
import { BaseDataSource, IDataSource } from '../datasources';
import { appErrorHandler, emojiFavicon, notFoundHandler } from '../middlewares';
import { IRepository } from '../repositories';
import { IService } from '../services';
import { AbstractApplication } from './abstract';
import { IApplication, IRestApplication } from './types';

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
    ctor: IClass<T>,
    _args?: O,
  ): IApplication {
    this.bind({
      key: BindingKeys.build({
        namespace: BindingNamespaces.COMPONENT,
        key: ctor.name,
      }),
    })
      .toClass(ctor)
      .setScope(BindingScopes.SINGLETON);
    return this;
  }

  async registerComponents() {
    await executeWithPerformanceMeasure({
      logger: this.logger,
      scope: this.registerComponents.name,
      description: 'Register application components',
      task: async () => {
        const bindings = this.findByTag<BaseComponent>({ tag: 'components' });
        for (const binding of bindings) {
          const instance = this.get<BaseComponent>({ key: binding.key, isOptional: false });
          await instance.configure();
        }
      },
    });
  }

  // ------------------------------------------------------------------------------
  controller<T>(ctor: IClass<T>): IApplication {
    this.bind<T>({
      key: BindingKeys.build({
        namespace: BindingNamespaces.CONTROLLER,
        key: ctor.name,
      }),
    }).toClass(ctor);
    return this;
  }

  async registerControllers() {
    await executeWithPerformanceMeasure({
      logger: this.logger,
      description: 'Register application controllers',
      scope: this.registerControllers.name,
      task: async () => {
        const router = this.getRootRouter();

        const bindings = this.findByTag<BaseController>({ tag: 'controllers' });
        for (const binding of bindings) {
          const controllerMetadata = MetadataRegistry.getControllerMetadata({
            target: binding.getBindingMeta({ type: BindingValueTypes.CLASS }),
          });

          if (isEmpty(controllerMetadata?.path)) {
            throw ApplicationError.getError({
              statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
              message: `[registerControllers] key: '${binding.key}' | Invalid controller metadata, 'path' is required for controller metadata`,
            });
          }

          const instance = this.get<BaseController>({ key: binding.key, isOptional: false });
          await instance.configure();

          router.route(controllerMetadata.path, instance.getRouter());
        }
      },
    });
  }

  // ------------------------------------------------------------------------------
  service<T extends IService>(ctor: IClass<T>): IApplication {
    this.bind({
      key: BindingKeys.build({
        namespace: BindingNamespaces.SERVICE,
        key: ctor.name,
      }),
    }).toClass(ctor);
    return this;
  }

  // ------------------------------------------------------------------------------
  repository<T extends IRepository>(ctor: IClass<T>): IApplication {
    this.bind({
      key: BindingKeys.build({
        namespace: BindingNamespaces.REPOSITORY,
        key: ctor.nameff,
      }),
    }).toClass(ctor);
    return this;
  }
  // ------------------------------------------------------------------------------
  dataSource<T extends IDataSource>(ctor: IClass<T>): IApplication {
    this.bind({
      key: BindingKeys.build({
        namespace: BindingNamespaces.DATASOURCE,
        key: ctor.name,
      }),
    })
      .toClass(ctor)
      .setScope(BindingScopes.SINGLETON);
    return this;
  }

  async registerDataSources() {
    await executeWithPerformanceMeasure({
      logger: this.logger,
      scope: this.registerDataSources.name,
      description: 'Register application data sources',
      task: async () => {
        const bindings = this.findByTag<BaseDataSource>({ tag: 'datasources' });
        for (const binding of bindings) {
          const instance = this.get<BaseDataSource>({ key: binding.key, isOptional: false });
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
        server.use(emojiFavicon({ icon: '🔥' }));
        server.notFound(notFoundHandler({ logger: this.logger }));
        server.onError(appErrorHandler({ logger: this.logger }));
      },
    });
  }

  // ------------------------------------------------------------------------------
  override async initialize() {
    this.printStartUpInfo({ scope: this.initialize.name });

    await super.initialize();

    this.component(RequestTrackerComponent);

    await this.registerDataSources();
    await this.registerComponents();
    await this.registerControllers();

    await this.registerDefaultMiddlewares();
  }
}
