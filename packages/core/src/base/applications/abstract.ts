import { CoreBindings } from '@/common/bindings';
import { Container } from '@/helpers/inversion/container';
import { OpenAPIHono } from '@hono/zod-openapi';
import type { ValueOrPromise } from '@venizia/ignis-helpers';
import {
  applicationEnvironment,
  getError,
  HTTP,
  RuntimeModules,
  toBoolean,
} from '@venizia/ignis-helpers';
import type { Env, Schema } from 'hono';
import { showRoutes as showApplicationRoutes } from 'hono/dev';
import isEmpty from 'lodash/isEmpty';
import path from 'node:path';
import type {
  IApplication,
  IApplicationConfigs,
  IApplicationInfo,
  TBunServerInstance,
  TNodeServerInstance,
} from './types';

const DEFAULT_SERVER_HOST = 'localhost';
const DEFAULT_SERVER_PORT = 3000;
const MAX_SERVER_PORT = 65535;

/** Resolves the first USABLE port among the candidates - `0` legitimately asks the OS for an ephemeral port, so candidates are rejected on validity, never falsiness. */
const resolveServerPort = (opts: { candidates: Array<number | string | undefined> }): number => {
  for (const candidate of opts.candidates) {
    if (candidate === undefined || candidate === null) {
      continue;
    }

    const normalized = typeof candidate === 'string' ? candidate.trim() : candidate;
    if (normalized === '') {
      continue;
    }

    const parsed = Number(normalized);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > MAX_SERVER_PORT) {
      continue;
    }

    return parsed;
  }

  return DEFAULT_SERVER_PORT;
};

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

  private postStartHooks: Array<{ identifier: string; hook: () => ValueOrPromise<void> }> = [];
  private postStopHooks: Array<{ identifier: string; hook: () => ValueOrPromise<void> }> = [];

  constructor(opts: { scope: string; config: IApplicationConfigs }) {
    const { scope, config } = opts;
    super({ scope });

    this.configs = Object.assign({}, config, {
      host:
        [config.host, process.env.HOST, process.env.APP_ENV_SERVER_HOST].find(Boolean) ??
        DEFAULT_SERVER_HOST,
      port: resolveServerPort({
        candidates: [config.port, process.env.PORT, process.env.APP_ENV_SERVER_PORT],
      }),
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

  abstract getAppInfo(): ValueOrPromise<IApplicationInfo>;
  abstract preConfigure(): ValueOrPromise<void>;
  abstract postConfigure(): ValueOrPromise<void>;

  abstract staticConfigure(): void;

  abstract setupMiddlewares(opts?: {
    middlewares?: Record<string | symbol, any>;
  }): ValueOrPromise<void>;

  abstract initialize(): Promise<void>;

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

  getServerInstance<
    T extends TBunServerInstance | TNodeServerInstance = TBunServerInstance | TNodeServerInstance,
  >(): T | undefined {
    return this.server.instance as T | undefined;
  }

  registerPostStartHook(opts: { identifier: string; hook: () => ValueOrPromise<void> }) {
    this.postStartHooks.push(opts);
    this.logger
      .for(this.registerPostStartHook.name)
      .debug('Registered post-start hook | identifier: %s', opts.identifier);
  }

  /** Runs every post-start hook in isolation - the server is already listening, so a throwing hook must not cancel the ones behind it; failures are collected and reported as one error at the end. */
  protected async executePostStartHooks() {
    if (this.postStartHooks.length === 0) {
      return;
    }

    const logger = this.logger.for(this.executePostStartHooks.name);
    logger.info('Executing %s post-start hook(s)...', this.postStartHooks.length);

    const failures: Array<{ identifier: string; error: unknown }> = [];

    for (const { identifier, hook } of this.postStartHooks) {
      const t = performance.now();

      try {
        await hook();
      } catch (error) {
        logger.error('Failed to execute hook | identifier: %s | error: %s', identifier, error);
        failures.push({ identifier, error });
        continue;
      }

      logger.info(
        'Executed hook | identifier: %s | took: %s (ms)',
        identifier,
        performance.now() - t,
      );
    }

    if (failures.length === 0) {
      return;
    }

    throw getError({
      statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
      message: `[executePostStartHooks] Failed post-start hook(s): ${failures
        .map(failure => `${failure.identifier} (${failure.error})`)
        .join(', ')}`,
    });
  }

  registerPostStopHook(opts: { identifier: string; hook: () => ValueOrPromise<void> }) {
    this.postStopHooks.push(opts);
    this.logger
      .for(this.registerPostStopHook.name)
      .debug('Registered post-stop hook | identifier: %s', opts.identifier);
  }

  protected async executePostStopHooks() {
    const logger = this.logger.for(this.executePostStopHooks.name);
    for (const { identifier, hook } of this.postStopHooks) {
      try {
        await hook();
      } catch (error) {
        logger.error('Post-stop hook failed | identifier: %s | error: %s', identifier, error);
      }
    }
  }

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

  protected startBunModule() {
    return new Promise((resolve, reject) => {
      if (this.server.runtime !== RuntimeModules.BUN) {
        return reject(
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
          this.configs.port = rs.port;
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
        return reject(
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

          // Resolve from the listening callback, not serve()'s synchronous return - only then is the socket bound and the OS-assigned port (config port `0`) known.
          const rs = serve({ fetch: server.fetch, port, hostname: host }, info => {
            this.configs.port = info.port;
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

            this.server.instance = rs;
            resolve(rs);
          });
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

  init() {
    this.registerCoreBindings();
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

    await this.executePostStartHooks();
  }

  async stop() {
    await this.executePostStopHooks();

    const instance = this.server.instance;
    if (!instance) {
      this.logger.for(this.stop.name).info('Server was not started | Nothing to stop');
      return;
    }

    switch (this.server.runtime) {
      case RuntimeModules.BUN: {
        await instance.stop();
        break;
      }
      case RuntimeModules.NODE: {
        // `close()` is callback-based: without this bridge stop() resolves while the socket is still bound, so an immediate restart races the previous listener.
        await new Promise<void>((resolve, reject) => {
          instance.close((error?: Error) => {
            if (error) {
              reject(error);
              return;
            }

            resolve();
          });
        });
        break;
      }
      default: {
        throw getError({
          message: '[stop] Invalid runtimeModule to stop server instance!',
        });
      }
    }

    this.server.instance = undefined;
    this.logger.for(this.stop.name).info('Server STOPPED');
  }
}
