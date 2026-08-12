import { getError } from '@venizia/ignis-helpers/core';
import { RuntimeModules } from '@venizia/ignis-helpers/common';
import type { Env, Schema } from 'hono';
import path from 'node:path';
import { RestApplication } from './rest';
import type { IApplication, TBunServerInstance, TNodeServerInstance } from './types';

/** Adds the listening server (`Bun.serve` / `@hono/node-server`) on top of `RestApplication` - the only layer that touches a socket, so it is the layer that stays out of the browser-pure kernel. */
export abstract class ServerApplication<
  AppEnv extends Env = Env,
  AppSchema extends Schema = {},
  BasePath extends string = '/',
>
  extends RestApplication<AppEnv, AppSchema, BasePath>
  implements IApplication<AppEnv, AppSchema, BasePath>
{
  /** Restores the pre-split default: a server-capable application installs `hono/context-storage` unless the caller opts out explicitly. */
  protected override getDefaultAsyncContextEnabled(): boolean {
    return true;
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
    return this.server.instance as T | undefined;
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
