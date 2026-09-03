import { CoreBindings, RestApplication } from '@venizia/ignis-kernel';
import { getError } from '@venizia/ignis-helpers/core';
import { RuntimeModules } from '@venizia/ignis-helpers/common';
import type { Env, Schema } from 'hono';
import path from 'node:path';
import type { IServerApplication, IServerApplicationConfigs, TNodeServerInstance } from './types';

/** Lives here, not in the kernel: `Bun.serve` resolves only through `@types/bun`, and emitting `Bun` into the kernel's published `.d.ts` would force that dependency on every browser consumer of `@venizia/ignis-kernel`. This package legitimately has Bun types - it is the layer that calls `Bun.serve`. */
export type TBunServerInstance = ReturnType<typeof Bun.serve>;

const DEFAULT_SERVER_HOST = 'localhost';
const DEFAULT_SERVER_PORT = 3000;
const MAX_SERVER_PORT = 65535;

/**
 * The first candidate USABLE as a port. Rejection is on validity, never falsiness: `0` legitimately
 * asks the OS for an ephemeral port, and taking the first TRUTHY value instead let an unusable
 * `PORT` shadow a usable `APP_ENV_SERVER_PORT` - `PORT=abc APP_ENV_SERVER_PORT=8080` bound 3000, as
 * did Docker's legacy container-link form `PORT=tcp://172.17.0.5:8080`.
 */
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

/** Adds the listening server (`Bun.serve` / `@hono/node-server`) on top of `RestApplication` - the only layer that touches a socket, so it is the layer that stays out of the browser-pure kernel. */
export abstract class ServerApplication<
  AppEnv extends Env = Env,
  AppSchema extends Schema = {},
  BasePath extends string = '/',
>
  extends RestApplication<AppEnv, AppSchema, BasePath>
  implements IServerApplication<AppEnv, AppSchema, BasePath>
{
  /** Which runtime is underneath, and the socket once one is bound. Both live here, not on `RestApplication`: a browser Worker has neither, and `RuntimeModules.detect()` answers `'node'` there. */
  protected runtime = RuntimeModules.detect();
  protected serverInstance?: TBunServerInstance | TNodeServerInstance;

  /** Widened by this layer, which is the only one that binds a socket. Assigned by the base constructor - `declare` so no field initializer runs here and overwrites it with `undefined`. */
  declare protected configs: IServerApplicationConfigs;

  /**
   * The address resolution the kernel deliberately does not do: `host` and `port` mean nothing to a
   * host with no socket, and resolving them there silently configured every browser Worker with
   * `localhost:3000`. Env is the fallback, explicit config always wins.
   */
  constructor(opts: { scope: string; config: IServerApplicationConfigs }) {
    super(opts);

    this.configs.host =
      [opts.config.host, process.env.HOST, process.env.APP_ENV_SERVER_HOST].find(Boolean) ??
      DEFAULT_SERVER_HOST;
    this.configs.port = resolveServerPort({
      candidates: [opts.config.port, process.env.PORT, process.env.APP_ENV_SERVER_PORT],
    });
  }

  /** Restores the pre-split default: a server-capable application installs `hono/context-storage` unless the caller opts out explicitly. */
  protected override getDefaultAsyncContextEnabled(): boolean {
    return true;
  }

  /** Restores the pre-split default: a listening server has a real process cwd. An application may still override this further (several already do, with `__dirname`). */
  override getProjectRoot(): string {
    const projectRoot = process.cwd();
    this.bind<string>({ key: CoreBindings.APPLICATION_PROJECT_ROOT }).toValue(projectRoot);
    return projectRoot;
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

  getServerInstance<
    T extends TBunServerInstance | TNodeServerInstance = TBunServerInstance | TNodeServerInstance,
  >(): T | undefined {
    return this.serverInstance as T | undefined;
  }

  protected startBunModule() {
    return new Promise((resolve, reject) => {
      if (this.runtime !== RuntimeModules.BUN) {
        return reject(
          getError({
            message: `[startBunModule] Invalid runtime to start server | runtime: ${this.runtime} | required: ${RuntimeModules.BUN}`,
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
          this.serverInstance = rs;
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
      if (this.runtime !== RuntimeModules.NODE) {
        return reject(
          getError({
            message: `[startNodeModule] Invalid runtime to start server | runtime: ${this.runtime} | required: ${RuntimeModules.NODE}`,
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

            this.serverInstance = rs;
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

  async start() {
    await this.initialize();
    await this.setupMiddlewares();

    const server = this.getServer();
    server.route(this.configs.path.base, this.rootRouter);

    switch (this.runtime) {
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

    const instance = this.serverInstance;
    if (!instance) {
      this.logger.for(this.stop.name).info('Server was not started | Nothing to stop');
      return;
    }

    switch (this.runtime) {
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

    this.serverInstance = undefined;
    this.logger.for(this.stop.name).info('Server STOPPED');
  }
}
