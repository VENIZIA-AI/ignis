import { CoreBindings } from '@/common/bindings';
import { RuntimeModules, TRuntimeModule } from '@/common/constants';
import { ValueOrPromise } from '@/common/types';
import { applicationEnvironment } from '@/helpers/env';
import { getError } from '@/helpers/error';
import { Container } from '@/helpers/inversion';
import { int, toBoolean } from '@/utilities/parse.utility';
import { OpenAPIHono } from '@hono/zod-openapi';
import { Env, Schema } from 'hono';
import { showRoutes as showApplicationRoutes } from 'hono/dev';
import isEmpty from 'lodash/isEmpty';
import path from 'node:path';
import { defaultAPIHook } from '../middlewares';
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

  protected rootRouter: OpenAPIHono;
  protected configs: IApplicationConfigs;
  protected projectRoot: string;

  // ------------------------------------------------------------------------------
  constructor(opts: { scope: string; config: IApplicationConfigs }) {
    const { scope, config } = opts;
    super({ scope });

    this.configs = Object.assign({}, config, {
      host: config.host || process.env.HOST || process.env.APP_ENV_SERVER_HOST || 'localhost',
      port: config.port || int(process.env.PORT) || int(process.env.APP_ENV_SERVER_PORT) || 3000,
    });

    this.projectRoot = this.getProjectRoot();
    this.logger.info('[constructor] Project root: %s', this.projectRoot);

    const honoServer = new OpenAPIHono<AppEnv, AppSchema, BasePath>({
      strict: this.configs.strictPath ?? true,
      defaultHook: defaultAPIHook,
    });
    this.rootRouter = new OpenAPIHono({ strict: true });

    this.server = {
      hono: honoServer,
      runtime: this.detectRuntimeModule(),
    };
  }

  // ------------------------------------------------------------------------------
  abstract setupMiddlewares(opts?: {
    middlewares?: Record<string | symbol, any>;
  }): ValueOrPromise<void>;

  abstract staticConfigure(): void;
  abstract preConfigure(): ValueOrPromise<void>;
  abstract postConfigure(): ValueOrPromise<void>;
  abstract getAppInfo(): ValueOrPromise<IApplicationInfo>;

  // ------------------------------------------------------------------------------
  getProjectConfigs(): IApplicationConfigs {
    return this.configs;
  }

  getProjectRoot(): string {
    return process.cwd();
  }

  getRootRouter(): OpenAPIHono {
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

  async initialize() {
    this.bind<typeof this>({ key: CoreBindings.APPLICATION_INSTANCE }).toProvider(() => this);
    this.bind<typeof this.server>({ key: CoreBindings.APPLICATION_SERVER }).toProvider(
      () => this.server,
    );
    this.bind<typeof this.rootRouter>({ key: CoreBindings.APPLICATION_ROOT_ROUTER }).toProvider(
      () => this.rootRouter,
    );

    this.validateEnvs();
    this.staticConfigure();

    await this.preConfigure();
    await this.postConfigure();
  }

  // ------------------------------------------------------------------------------
  protected detectRuntimeModule(): TRuntimeModule {
    if (typeof Bun !== 'undefined') {
      return RuntimeModules.BUN;
    }

    return RuntimeModules.NODE;
  }

  protected inspectRoutes() {
    const t = performance.now();
    const showRoutes = this.configs?.debug?.showRoutes ?? false;

    if (!showRoutes) {
      return;
    }

    this.logger.info('[inspectRoutes] START | Inspect all application route(s)');
    showApplicationRoutes(this.getServer());
    this.logger.info(
      '[start] DONE | Inspect all application route(s) | Took: %s (ms)',
      performance.now() - t,
    );
  }

  protected validateEnvs() {
    const t = performance.now();
    const envKeys = applicationEnvironment.keys();
    this.logger.info(
      '[initialize] Envs: %s | START Validating application environments...',
      envKeys.length,
    );

    for (const argKey of envKeys) {
      const argValue = applicationEnvironment.get<string | number>(argKey);

      if (toBoolean(process.env.ALLOW_EMPTY_ENV_VALUE) || !isEmpty(argValue)) {
        continue;
      }

      throw getError({
        message: `[validateEnvs] Invalid Application Environment! Key: ${argKey} | Value: ${argValue}`,
      });
    }

    this.logger.info(
      '[validateEnvs] Envs: %s | DONE Validating application environments | Took: %s (ms)',
      envKeys.length,
      performance.now() - t,
    );
  }

  // ------------------------------------------------------------------------------
  protected startBunModule() {
    return new Promise((resolve, reject) => {
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

          this.logger.info('[start] Server STARTED | Address: %s', this.getServerAddress());
          this.logger.info(
            '[start] Log folder: %s',
            path.resolve(process.env.APP_ENV_LOGGER_FOLDER_PATH ?? '').toString(),
          );

          resolve(rs);
        })
        .catch(reject);
    });
  }

  protected startNodeModule() {
    return new Promise((resolve, reject) => {
      const port = this.getServerPort();
      const host = this.getServerHost();
      const server = this.getServer();

      import('@hono/node-server')
        .then(module => {
          const { serve } = module;
          const rs = serve({ fetch: server.fetch, port, hostname: host }, info => {
            this.inspectRoutes();
            this.logger.info(
              '[start] Server STARTED | Address: %s | Info: %j',
              this.getServerAddress(),
              info,
            );
            this.logger.info(
              '[start] Log folder: %s',
              path.resolve(process.env.APP_ENV_LOGGER_FOLDER_PATH ?? '').toString(),
            );
          });

          this.server.instance = rs;
          resolve(rs);
        })
        .catch(error => {
          this.logger.error('[start] Failed to import @hono/node-server | Error: %s', error);
          reject(
            getError({
              message: `[start] @hono/node-server is required for Node.js runtime. Please install '@hono/node-server'`,
            }),
          );
        });
    });
  }

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
    this.logger.info('[stop] Server STOPPED');
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
