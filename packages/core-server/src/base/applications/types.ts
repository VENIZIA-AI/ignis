import type {
  IApplication,
  IApplicationConfigs as IKernelApplicationConfigs,
} from '@venizia/ignis-kernel';
import type { Env, Schema } from 'hono';

/** `any`, resolved at runtime from `@hono/node-server` - naming its real type would make that package a hard dependency. */
export type TNodeServerInstance = any;

/**
 * What a host with a real socket configures on top of the kernel's shape. `host` and `port` are
 * meaningless to a browser Worker, which is why they are not on the kernel's own interface - see
 * {@link IServerApplication}.
 */
export interface IServerApplicationConfigs extends IKernelApplicationConfigs {
  host?: string;
  port?: number;
}

/**
 * The kernel's contract plus what only a listening server can answer. `RestApplication` deliberately
 * implements none of these: a browser Worker has no host, no port, and nothing to `start()` - it
 * answers `postMessage` instead.
 */
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
