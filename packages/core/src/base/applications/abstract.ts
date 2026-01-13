import { CoreBindings } from '@/common/bindings';
import { Container } from '@/helpers/inversion';
import { OpenAPIHono } from '@hono/zod-openapi';
import {
  applicationEnvironment,
  getError,
  int,
  RuntimeModules,
  toBoolean,
  ValueOrPromise,
} from '@venizia/ignis-helpers';
import { Env, Schema } from 'hono';
import { showRoutes as showApplicationRoutes } from 'hono/dev';
import isEmpty from 'lodash/isEmpty';
import path from 'node:path';
import {
  IApplication,
  IApplicationConfigs,
  IApplicationInfo,
  TBunServerInstance,
  TNodeServerInstance,
} from './types';

// ------------------------------------------------------------------------------
export abstract class AbstractApplication<
  AppEnv extends Env = Env,
  AppSchema extends Schema = {},
  BasePath extends string = '/',
>
  extends Container
  implements IApplication<AppEnv, AppSchema, BasePath>
{
  protected server:
    | {
        hono: OpenAPIHono<AppEnv, AppSchema, BasePath>;
        runtime: typeof RuntimeModules.BUN;
        instance?: TBunServerInstance;
      }
    | {
        hono: OpenAPIHono<AppEnv, AppSchema, BasePath>;
        runtime: typeof RuntimeModules.NODE;
        instance?: TNodeServerInstance;
      };

  protected rootRouter: OpenAPIHono<AppEnv, AppSchema, BasePath>;
  protected configs: IApplicationConfigs;
  protected projectRoot: string;

  // ------------------------------------------------------------------------------
  constructor(opts: { scope: string; config: IApplicationConfigs }) {
    const { scope, config } = opts;
    super({ scope });

    this.configs = Object.assign({}, config, {
      host: config.host || process.env.HOST || process.env.APP_ENV_SERVER_HOST || 'localhost',
      port: config.port || int(process.env.PORT) || int(process.env.APP_ENV_SERVER_PORT) || 3000,
      asyncContext: { enable: config?.asyncContext?.enable ?? true },
    });

    this.projectRoot = this.getProjectRoot();
    this.logger.for('constructor').info('Project root: %s', this.projectRoot);

    const honoServer = new OpenAPIHono<AppEnv, AppSchema, BasePath>({
      strict: this.configs.strictPath ?? true,
    });
    this.rootRouter = new OpenAPIHono({
      strict: this.configs.strictPath ?? true,
    });

    this.server = {
      hono: honoServer,
      runtime: RuntimeModules.detect(),
    };
  }

  // ------------------------------------------------------------------------------
  abstract getAppInfo(): ValueOrPromise<IApplicationInfo>;
  abstract preConfigure(): ValueOrPromise<void>;
  abstract postConfigure(): ValueOrPromise<void>;

  abstract staticConfigure(): void;

  abstract setupMiddlewares(opts?: {
    middlewares?: Record<string | symbol, any>;
  }): ValueOrPromise<void>;

  abstract initialize(): Promise<void>;

  // ------------------------------------------------------------------------------
  getProjectConfigs(): IApplicationConfigs {
    return this.configs;
  }

  getProjectRoot(): string {
    const projectRoot = process.cwd();
    this.bind<string>({ key: CoreBindings.APPLICATION_PROJECT_ROOT }).toValue(projectRoot);
    return projectRoot;
  }

  getRootRouter(): OpenAPIHono<AppEnv, AppSchema, BasePath> {
    return this.rootRouter;
  }

  getServerHost(): string {
    return this.configs.host!;
  }

  getServerPort(): number {
    return this.configs.port!;
  }

  getServerAddress() {
    return `${this.getServerHost()}:${this.getServerPort()}`;
  }

  getServer(): OpenAPIHono<AppEnv, AppSchema, BasePath> {
    return this.server.hono;
  }

  getServerInstance() {
    return this.server.instance;
  }

  // ------------------------------------------------------------------------------
  protected registerCoreBindings() {
    this.bind<typeof this>({
      key: CoreBindings.APPLICATION_INSTANCE,
    }).toProvider(_ => this);
    this.bind<typeof this.server>({
      key: CoreBindings.APPLICATION_SERVER,
    }).toProvider(_ => this.server);
    this.bind<typeof this.rootRouter>({
      key: CoreBindings.APPLICATION_ROOT_ROUTER,
    }).toProvider(_ => this.rootRouter);
  }

  protected inspectRoutes() {
    const t = performance.now();
    const shouldShowRoutes = this.configs?.debug?.shouldShowRoutes ?? false;

    if (!shouldShowRoutes) {
      return;
    }

    this.logger.for(this.inspectRoutes.name).info('START | Inspect all application route(s)');
    showApplicationRoutes(this.getServer());
    this.logger
      .for(this.start.name)
      .info('DONE | Inspect all application route(s) | Took: %s (ms)', performance.now() - t);
  }

  protected validateEnvs() {
    const t = performance.now();
    const envKeys = applicationEnvironment.keys();
    this.logger
      .for(this.initialize.name)
      .info('Envs: %s | START Validating application environments...', envKeys.length);

    for (const argKey of envKeys) {
      const argValue = applicationEnvironment.get<string | number>(argKey);

      if (toBoolean(process.env.ALLOW_EMPTY_ENV_VALUE) || !isEmpty(argValue)) {
        continue;
      }

      throw getError({
        message: `[validateEnvs] Invalid Application Environment! Key: ${argKey} | Value: ${argValue}`,
      });
    }

    this.logger
      .for(this.validateEnvs.name)
      .info(
        'Envs: %s | DONE Validating application environments | Took: %s (ms)',
        envKeys.length,
        performance.now() - t,
      );
  }

  // ------------------------------------------------------------------------------
  protected startBunModule() {
    return new Promise((resolve, reject) => {
      if (this.server.runtime !== RuntimeModules.BUN) {
        reject(
          getError({
            message: `[startBunModule] Invalid runtime to start server | runtime: ${this.server.runtime} | required: ${RuntimeModules.BUN}`,
          }),
        );
      }

      const port = this.getServerPort();
      const host = this.getServerHost();
      const server = this.getServer();

      Promise.resolve(
        Bun.serve({
          port,
          hostname: host,
          fetch: server.fetch,
        }),
      )
        .then(rs => {
          this.server.instance = rs;
          this.inspectRoutes();

          this.logger
            .for(this.start.name)
            .info('Server STARTED | Address: %s', this.getServerAddress());
          this.logger
            .for(this.start.name)
            .info(
              'Log folder: %s',
              path.resolve(process.env.APP_ENV_LOGGER_FOLDER_PATH ?? '').toString(),
            );

          resolve(rs);
        })
        .catch(reject);
    });
  }

  protected startNodeModule() {
    return new Promise((resolve, reject) => {
      if (this.server.runtime !== RuntimeModules.NODE) {
        reject(
          getError({
            message: `[startNodeModule] Invalid runtime to start server | runtime: ${this.server.runtime} | required: ${RuntimeModules.NODE}`,
          }),
        );
      }

      const port = this.getServerPort();
      const host = this.getServerHost();
      const server = this.getServer();

      import('@hono/node-server')
        .then(module => {
          const { serve } = module;
          const rs = serve({ fetch: server.fetch, port, hostname: host }, info => {
            this.inspectRoutes();
            this.logger
              .for(this.start.name)
              .info('Server STARTED | Address: %s | Info: %j', this.getServerAddress(), info);
            this.logger
              .for(this.start.name)
              .info(
                'Log folder: %s',
                path.resolve(process.env.APP_ENV_LOGGER_FOLDER_PATH ?? '').toString(),
              );
          });

          this.server.instance = rs;
          resolve(rs);
        })
        .catch(error => {
          this.logger
            .for(this.start.name)
            .error('Failed to import @hono/node-server | Error: %s', error);
          reject(
            getError({
              message: `[start] @hono/node-server is required for Node.js runtime. Please install '@hono/node-server'`,
            }),
          );
        });
    });
  }

  // ------------------------------------------------------------------------------
  init() {
    this.registerCoreBindings();
  }

  // ------------------------------------------------------------------------------
  async start() {
    await this.initialize();
    await this.setupMiddlewares();

    const server = this.getServer();
    server.route(this.configs.path.base, this.rootRouter);

    switch (this.server.runtime) {
      case RuntimeModules.BUN: {
        await this.startBunModule();
        break;
      }
      case RuntimeModules.NODE: {
        await this.startNodeModule();
        break;
      }
      default: {
        throw getError({
          message: '[start] Invalid runtimeModule to start server instance!',
        });
      }
    }
  }

  stop() {
    this.logger.for(this.stop.name).info('Server STOPPED');
    switch (this.server.runtime) {
      case RuntimeModules.BUN: {
        this.server.instance?.stop();
        break;
      }
      case RuntimeModules.NODE: {
        this.server.instance?.close();
        break;
      }
      default: {
        throw getError({
          message: '[stop] Invalid runtimeModule to stop server instance!',
        });
      }
    }
  }
}
