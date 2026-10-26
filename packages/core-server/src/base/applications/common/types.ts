import type {
  IApplication,
  IApplicationConfigs as IKernelApplicationConfigs,
} from '@venizia/ignis-kernel';
import type { Env, Schema } from 'hono';

/**
 * What a host with a real socket configures on top of the kernel's shape. `host` and `port` are
 * meaningless to a browser Worker, which is why they are not on the kernel's own interface - see
 * {@link IServerApplication}.
 */
export interface IServerApplicationConfigs extends IKernelApplicationConfigs {
  host?: string;
  port?: number;
  /** Bound as `CoreBindings.APPLICATION_PROJECT_ROOT` at construction and handed to `ModuleUtility`; default `process.cwd()`. Must be the directory holding `node_modules` at run time - never `__dirname` inside a compiled binary. */
  projectRoot?: string;
  /** Bun-only socket options passed straight to `Bun.serve`. Unset keys keep Bun's own defaults. */
  server?: IServerRuntimeConfigs;
}

/** The `Bun.serve` options an application has a reason to change without re-implementing `startBunModule`. */
export interface IServerRuntimeConfigs {
  /** Seconds a connection may sit idle before Bun closes it; Bun caps it at 255. */
  idleTimeout?: number;
  /** Largest request body in bytes. */
  maxRequestBodySize?: number;
}

/**
 * The kernel's contract plus what only a listening server can answer. `RestApplication` deliberately
 * implements none of these: a browser Worker has no host, no port, and nothing to `start()` - it
 * answers `postMessage` instead.
 */
/** Options of `ServerApplication.installShutdownSignals`. */
export interface IShutdownSignalsOptions {
  /** The signals that stop the application. Default `['SIGTERM', 'SIGINT']`. */
  signals?: NodeJS.Signals[];

  /** How long a shutdown may take before the process is force-exited with code 1. Default `15_000`. */
  timeoutMs?: number;

  /** What ends the process: `process.exit` by default. A seam for tests and for hosts that exit differently. */
  exit?: (code: number) => void;
}

export interface IServerApplication<
  AppEnv extends Env = Env,
  AppSchema extends Schema = Schema,
  BasePath extends string = '/',
> extends IApplication<AppEnv, AppSchema, BasePath> {
  getServerHost(): string;
  getServerPort(): number;
  getServerAddress(): string;

  start(): Promise<void> | void;
  stop(): Promise<void> | void;
}
