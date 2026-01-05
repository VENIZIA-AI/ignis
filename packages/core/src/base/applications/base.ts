import { BindingNamespaces, TBindingNamespace } from '@/common/bindings';
import { RequestTrackerComponent } from '@/components';
import {
  Binding,
  BindingKeys,
  BindingScopes,
  BindingValueTypes,
  MetadataRegistry,
} from '@/helpers/inversion';
import {
  Bootstrapper,
  ControllerBooter,
  DatasourceBooter,
  IBootableApplication,
  IBooter,
  IBootReport,
  RepositoryBooter,
  ServiceBooter,
} from '@venizia/ignis-boot';
import {
  AnyObject,
  executeWithPerformanceMeasure,
  getError,
  HTTP,
  IConfigurable,
  RuntimeModules,
  TClass,
} from '@venizia/ignis-helpers';
import { contextStorage } from 'hono/context-storage';
import isEmpty from 'lodash/isEmpty';
import { BaseComponent } from '../components';
import { BaseController } from '../controllers';
import { IDataSource } from '../datasources';
import { appErrorHandler, emojiFavicon, notFoundHandler, requestNormalize } from '../middlewares';
import { TMixinOpts } from '../mixins';
import { TTableSchemaWithId } from '../models/common';
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
interface IRegisterDynamicBindingsOptions<T extends IConfigurable = IConfigurable> {
  namespace: TBindingNamespace;
  onBeforeConfigure?: (opts: { binding: Binding<T> }) => Promise<void>;
  onAfterConfigure?: (opts: { binding: Binding<T>; instance: T }) => Promise<void>;
}

// ------------------------------------------------------------------------------
export abstract class BaseApplication
  extends AbstractApplication
  implements IRestApplication, IBootableApplication
{
  private registeredBindings: Record<string, Set<string>> = {};

  // ------------------------------------------------------------------------------
  protected normalizePath(...segments: string[]): string {
    const joined = segments.join('/').replace(/\/+/g, '/').replace(/\/$/, '');
    return joined || '/';
  }

  // ------------------------------------------------------------------------------
  protected async registerDynamicBindings<T extends IConfigurable = IConfigurable>(
    opts: IRegisterDynamicBindingsOptions<T>,
  ): Promise<void> {
    const { namespace, onBeforeConfigure, onAfterConfigure } = opts;

    if (!this.registeredBindings[namespace]) {
      this.registeredBindings[namespace] = new Set<string>();
    }
    const configured = this.registeredBindings[namespace];

    let bindings = this.findByTag({ tag: namespace, exclude: configured });
    while (bindings.length > 0) {
      const binding = bindings.shift();
      if (!binding) {
        this.logger.debug('[registerDynamicBindings] Empty binding | namespace: %s', namespace);
        continue;
      }

      if (onBeforeConfigure) {
        await onBeforeConfigure({ binding });
      }

      const instance = this.get<T>({ key: binding.key, isOptional: false });
      if (!instance) {
        this.logger.debug(
          '[registerDynamicBindings] No binding instance | namespace: %s | key: %s',
          namespace,
          binding.key,
        );
        configured.add(binding.key);
        continue;
      }

      await instance.configure();
      configured.add(binding.key);

      if (onAfterConfigure) {
        await onAfterConfigure({ binding, instance });
      }

      // Re-fetch excluding already configured - picks up dynamically added bindings
      bindings = this.findByTag({ tag: namespace, exclude: configured });
    }
  }

  // ------------------------------------------------------------------------------
  component<Base extends BaseComponent, Args extends AnyObject = any>(
    ctor: TClass<Base>,
    opts?: TMixinOpts<Args>,
  ): Binding<Base> {
    return this.bind<Base>({
      key: BindingKeys.build(
        opts?.binding ?? { namespace: BindingNamespaces.COMPONENT, key: ctor.name },
      ),
    })
      .toClass(ctor)
      .setScope(BindingScopes.SINGLETON);
  }

  async registerComponents(): Promise<void> {
    await executeWithPerformanceMeasure({
      logger: this.logger,
      scope: this.registerComponents.name,
      description: 'Register application components',
      task: async () => {
        await this.registerDynamicBindings({
          namespace: BindingNamespaces.COMPONENT,
          onAfterConfigure: async () => {
            // Register any datasources dynamically added by this component
            await this.registerDynamicBindings({ namespace: BindingNamespaces.DATASOURCE });
          },
        });
      },
    });
  }

  // ------------------------------------------------------------------------------
  controller<Base, Args extends AnyObject = any>(
    ctor: TClass<Base>,
    opts?: TMixinOpts<Args>,
  ): Binding<Base> {
    return this.bind<Base>({
      key: BindingKeys.build(
        opts?.binding ?? {
          namespace: BindingNamespaces.CONTROLLER,
          key: ctor.name,
        },
      ),
    }).toClass(ctor);
  }

  // ------------------------------------------------------------------------------
  async registerControllers(): Promise<void> {
    await executeWithPerformanceMeasure({
      logger: this.logger,
      description: 'Register application controllers',
      scope: this.registerControllers.name,
      task: async () => {
        const router = this.getRootRouter();

        await this.registerDynamicBindings<BaseController>({
          namespace: BindingNamespaces.CONTROLLER,
          onBeforeConfigure: async ({ binding }) => {
            const controllerMetadata = MetadataRegistry.getInstance().getControllerMetadata({
              target: binding.getBindingMeta({ type: BindingValueTypes.CLASS }),
            });

            if (!controllerMetadata?.path || isEmpty(controllerMetadata?.path)) {
              throw getError({
                statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
                message: `[registerControllers] key: '${binding.key}' | Invalid controller metadata, 'path' is required for controller metadata`,
              });
            }
          },
          onAfterConfigure: async ({ binding, instance }) => {
            const controllerMetadata = MetadataRegistry.getInstance().getControllerMetadata({
              target: binding.getBindingMeta({ type: BindingValueTypes.CLASS }),
            });

            if (controllerMetadata?.path) {
              router.route(controllerMetadata.path, instance.getRouter());
            }
          },
        });
      },
    });
  }

  // ------------------------------------------------------------------------------
  service<Base extends IService, Args extends AnyObject = any>(
    ctor: TClass<Base>,
    opts?: TMixinOpts<Args>,
  ): Binding<Base> {
    return this.bind<Base>({
      key: BindingKeys.build(
        opts?.binding ?? {
          namespace: BindingNamespaces.SERVICE,
          key: ctor.name,
        },
      ),
    }).toClass(ctor);
  }

  // ------------------------------------------------------------------------------
  repository<Base extends IRepository<TTableSchemaWithId>, Args extends AnyObject = any>(
    ctor: TClass<Base>,
    opts?: TMixinOpts<Args>,
  ): Binding<Base> {
    return this.bind<Base>({
      key: BindingKeys.build(
        opts?.binding ?? {
          namespace: BindingNamespaces.REPOSITORY,
          key: ctor.name,
        },
      ),
    }).toClass(ctor);
  }

  // ------------------------------------------------------------------------------
  dataSource<Base extends IDataSource, Args extends AnyObject = any>(
    ctor: TClass<Base>,
    opts?: TMixinOpts<Args>,
  ): Binding<Base> {
    return this.bind<Base>({
      key: BindingKeys.build(
        opts?.binding ?? {
          namespace: BindingNamespaces.DATASOURCE,
          key: ctor.name,
        },
      ),
    })
      .toClass(ctor)
      .setScope(BindingScopes.SINGLETON);
  }

  // ------------------------------------------------------------------------------
  async registerDataSources(): Promise<void> {
    await executeWithPerformanceMeasure({
      logger: this.logger,
      scope: this.registerDataSources.name,
      description: 'Register application data sources',
      task: async () => {
        await this.registerDynamicBindings({ namespace: BindingNamespaces.DATASOURCE });
      },
    });
  }

  // ------------------------------------------------------------------------------
  booter<Base extends IBooter, Args extends AnyObject = any>(
    ctor: TClass<Base>,
    opts?: TMixinOpts<Args>,
  ): Binding<Base> {
    return this.bind<Base>({
      key: BindingKeys.build(
        opts?.binding ?? { namespace: BindingNamespaces.BOOTERS, key: ctor.name },
      ),
    })
      .toClass(ctor)
      .setTags('booter');
  }

  // ------------------------------------------------------------------------------
  async registerBooters() {
    await executeWithPerformanceMeasure({
      logger: this.logger,
      scope: this.registerDataSources.name,
      description: 'Register application data sources',
      task: async () => {
        this.bind({ key: `@app/boot-options` }).toValue(this.configs.bootOptions ?? {});
        this.bind({ key: 'bootstrapper' }).toClass(Bootstrapper).setScope(BindingScopes.SINGLETON);

        // Define default booters
        this.booter(DatasourceBooter);
        this.booter(RepositoryBooter);
        this.booter(ServiceBooter);
        this.booter(ControllerBooter);
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

        if (this.configs.asyncContext?.enable) {
          server.use(contextStorage());
        }

        // Assign requestId for every single request from client
        this.component(RequestTrackerComponent);

        // NOTE: Bug from Bun + Hono, this middleware aims to parse needed body for continue handling request
        // Refer: https://github.com/honojs/middleware/issues/81
        server.use(requestNormalize());

        server.use(emojiFavicon({ icon: this.configs.favicon ?? '🔥' }));
        server.notFound(notFoundHandler({ logger: this.logger }));

        server.onError(
          appErrorHandler({
            logger: this.logger,
            rootKey: this.configs.error?.rootKey ?? undefined,
          }),
        );
      },
    });
  }

  // ------------------------------------------------------------------------------
  async boot(): Promise<IBootReport> {
    await this.registerBooters();

    const bootstrapper = this.get<Bootstrapper>({ key: 'bootstrapper' });

    return bootstrapper.boot({});
  }

  // ------------------------------------------------------------------------------
  override async initialize() {
    this.printStartUpInfo({ scope: this.initialize.name });
    this.validateEnvs();

    await this.registerDefaultMiddlewares();
    this.staticConfigure();

    await this.preConfigure();

    // IMPORTANT: DataSources must be registered and configured before repositories
    // This ensures datasources are available for auto-resolution
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
