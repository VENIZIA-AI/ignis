import { CoreBindings, RestApplication } from '@venizia/ignis-kernel';
import { ModuleUtility } from '@venizia/ignis-helpers';
import { getError } from '@venizia/ignis-helpers/core';
import { RuntimeModules } from '@venizia/ignis-helpers/common';
import type { Env, Schema } from 'hono';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type {
  IServerApplication,
  IServerApplicationConfigs,
  IServerRuntimeConfigs,
  IShutdownSignalsOptions,
} from './common';

/** Lives here, not in the kernel: `Bun.serve` resolves only through `@types/bun`, and emitting `Bun` into the kernel's published `.d.ts` would force that dependency on every browser consumer of `@venizia/ignis-kernel`. This package legitimately has Bun types - it is the layer that calls `Bun.serve`. */
export type TBunServerInstance = ReturnType<typeof Bun.serve>;

const MINIMUM_BUN = { major: 1, minor: 4 };

/** What the process runs on. `Bun` is the one global that tells the runtimes apart, and it cannot be hidden in a test, so the guard reads this snapshot instead. */
export interface IRuntimeSnapshot {
  /** `Bun.version`, set only under Bun. */
  bunVersion?: string;
  /** `process.release.name` and `process.version` of a runtime that is not Bun (`node`, `v24.14.0`). */
  otherName?: string;
  otherVersion?: string;
}

export const readRuntimeSnapshot = (): IRuntimeSnapshot => ({
  bunVersion: RuntimeModules.isBun() ? Bun.version : undefined,
  otherName: globalThis.process?.release?.name,
  otherVersion: globalThis.process?.version,
});

const describeRuntime = (opts: { runtime: IRuntimeSnapshot }): string => {
  const { bunVersion, otherName, otherVersion } = opts.runtime;

  if (bunVersion !== undefined) {
    return `bun ${bunVersion}`;
  }

  return otherName ? `${otherName} ${otherVersion ?? ''}`.trim() : 'an unknown runtime';
};

/**
 * IGNIS runs on Bun 1.4 or later, and nothing else. One refusal at the top of `start()`, before any
 * hook, datasource or socket is touched, replaces a failure that would otherwise surface halfway
 * through startup.
 */
export const assertBunRuntime = (opts: { runtime?: IRuntimeSnapshot } = {}): void => {
  const runtime = opts.runtime ?? readRuntimeSnapshot();

  if (runtime.bunVersion !== undefined) {
    const [major = 0, minor = 0] = runtime.bunVersion.split('.').map(Number);
    if (major > MINIMUM_BUN.major || (major === MINIMUM_BUN.major && minor >= MINIMUM_BUN.minor)) {
      return;
    }
  }

  throw getError({
    message: `IGNIS requires Bun >= ${MINIMUM_BUN.major}.${MINIMUM_BUN.minor} (running on ${describeRuntime({ runtime })})`,
  });
};

const DEFAULT_SHUTDOWN_SIGNALS: NodeJS.Signals[] = ['SIGTERM', 'SIGINT'];
const DEFAULT_SHUTDOWN_TIMEOUT_MS = 15_000;

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

/** Adds the listening server (`Bun.serve`) on top of `RestApplication` - the only layer that touches a socket, so it is the layer that stays out of the browser-pure kernel. */
export abstract class ServerApplication<
  AppEnv extends Env = Env,
  AppSchema extends Schema = {},
  BasePath extends string = '/',
>
  extends RestApplication<AppEnv, AppSchema, BasePath>
  implements IServerApplication<AppEnv, AppSchema, BasePath>
{
  /** Which runtime is underneath, and the socket once one is bound. Both live here, not on `RestApplication`: a browser Worker has neither. `start()` refuses to run unless this is Bun. */
  protected runtime = RuntimeModules.detect();
  protected serverInstance?: TBunServerInstance;

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

  /** `configs.projectRoot` wins, else the process cwd. The value is bound AND handed to `ModuleUtility`, so every peer lookup (optional modules, the gRPC adapter) resolves under it - a compiled binary sets it to where its `node_modules` really is. */
  override getProjectRoot(): string {
    const projectRoot = this.configs.projectRoot ?? process.cwd();
    if (this.configs.projectRoot && !existsSync(path.join(projectRoot, 'node_modules'))) {
      this.logger
        .for(this.getProjectRoot.name)
        .warn(
          'configs.projectRoot has no node_modules | root: %s | optional peers will not resolve from it',
          projectRoot,
        );
    }
    this.bind<string>({ key: CoreBindings.APPLICATION_PROJECT_ROOT }).toValue(projectRoot);
    ModuleUtility.setProjectRoot({ projectRoot });
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

  /** `configs.server` with unset keys dropped, so a missing option keeps Bun's default instead of passing `undefined`. */
  protected getServerRuntimeOptions(): IServerRuntimeConfigs {
    const { idleTimeout, maxRequestBodySize } = this.configs.server ?? {};
    return {
      ...(idleTimeout === undefined ? {} : { idleTimeout }),
      ...(maxRequestBodySize === undefined ? {} : { maxRequestBodySize }),
    };
  }

  /** What `start()` checks. A seam for the guard's test: the `Bun` global cannot be hidden from inside Bun. */
  protected getRuntimeSnapshot(): IRuntimeSnapshot {
    return readRuntimeSnapshot();
  }

  getServerInstance<T extends TBunServerInstance = TBunServerInstance>(): T | undefined {
    return this.serverInstance as T | undefined;
  }

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
          ...this.getServerRuntimeOptions(),
        }),
      )
        .then((rs) => {
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

  async start() {
    assertBunRuntime({ runtime: this.getRuntimeSnapshot() });

    await this.initialize();
    await this.setupMiddlewares();

    const server = this.getServer();
    server.route(this.configs.path.base, this.rootRouter);

    await this.startBunModule();

    await this.executePostStartHooks();
  }

  /** Post-stop hooks, then the server, then the datasources - closed even when the server fails to, so a stopped application holds no connection. */
  async stop() {
    await this.executePostStopHooks();

    try {
      await this.stopServer();
    } finally {
      await this.closeDataSources();
    }
  }

  /** Set once `installShutdownSignals` ran; holds the way back, so a second call is a no-op. */
  protected shutdownSignals?: { uninstall: () => void };

  /**
   * Stops the application on a signal (SIGTERM and SIGINT by default), then exits the process.
   * Opt-in: nothing is installed until you call it, usually right after `start()`.
   *
   * - Calls `stop()` once. A second signal while it runs is ignored.
   * - Exits 0 when `stop()` finishes, 1 when it throws or does not finish within `timeoutMs`.
   * - Idempotent: calling it again returns the same uninstall function and adds no listener.
   * - Returns an uninstall function that removes the listeners and the pending timeout.
   */
  installShutdownSignals(opts: IShutdownSignalsOptions = {}): () => void {
    if (this.shutdownSignals) {
      return this.shutdownSignals.uninstall;
    }

    const {
      signals = DEFAULT_SHUTDOWN_SIGNALS,
      timeoutMs = DEFAULT_SHUTDOWN_TIMEOUT_MS,
      exit = (code: number) => process.exit(code),
    } = opts;

    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw getError({
        message: `[installShutdownSignals] timeoutMs must be a positive number of milliseconds | value: ${String(timeoutMs)}`,
      });
    }

    const log = this.logger.for(this.installShutdownSignals.name);
    let isShuttingDown = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const finish = (code: number) => {
      clearTimeout(timer);
      exit(code);
    };

    const onSignal = (signal: NodeJS.Signals) => {
      if (isShuttingDown) {
        log.warn('Signal %s ignored | shutdown already in progress', signal);
        return;
      }

      isShuttingDown = true;
      log.info('Signal %s received | stopping the application | timeout: %s ms', signal, timeoutMs);

      timer = setTimeout(() => {
        log.error('Shutdown did not finish within %s ms | forcing exit', timeoutMs);
        exit(1);
      }, timeoutMs);

      this.stop().then(
        () => {
          log.info('Application stopped | exiting');
          finish(0);
        },
        (error: unknown) => {
          log.error(
            'Shutdown failed | error: %s',
            error instanceof Error ? error.message : String(error),
          );
          finish(1);
        },
      );
    };

    const listeners = signals.map((signal) => {
      const listener = () => onSignal(signal);
      process.on(signal, listener);
      return { signal, listener };
    });

    const uninstall = () => {
      clearTimeout(timer);
      for (const { signal, listener } of listeners) {
        process.off(signal, listener);
      }
      this.shutdownSignals = undefined;
    };

    this.shutdownSignals = { uninstall };
    return uninstall;
  }

  protected async stopServer(): Promise<void> {
    const instance = this.serverInstance;
    if (!instance) {
      this.logger.for(this.stop.name).info('Server was not started | Nothing to stop');
      return;
    }

    await instance.stop();

    this.serverInstance = undefined;
    this.logger.for(this.stop.name).info('Server STOPPED');
  }
}
