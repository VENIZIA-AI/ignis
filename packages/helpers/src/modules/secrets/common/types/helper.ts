import type { IConfigurable } from '@/common/types';
import type { ISecretLease, ISecretRotatable, TSecretRotationHandler } from './lease';
import type { IClock, ITimerAdapter } from './timer';

/** Selects a secret: the `path` of a bundle and optionally one `key` in it. `defaultValue` is returned when the key is absent. */
export interface IGetSecretOptions<TValue = string> {
  path: string;
  key?: string;
  defaultValue?: TValue;
}

/** Contract of a secrets provider: cached reads, dynamic leases with rotation handlers, and shutdown. */
export interface ISecretsHelper extends IConfigurable {
  /** The value of `key` (the whole bundle without one), or `defaultValue`. Check what you read. */
  get(opts: IGetSecretOptions<unknown>): Promise<unknown>;
  getBundle(opts: { path: string }): Promise<Record<string, string>>;
  lease(opts: { path: string; key: string }): Promise<ISecretLease>;
  onRotate(handler: TSecretRotationHandler): void;
  registerRotatable(opts: { key: string; target: ISecretRotatable }): void;
  shutdown(): Promise<void>;
}

/** Constructor options of a secrets provider. `clock` and `timers` can be replaced in tests. */
export interface ISecretsHelperOptions {
  scope: string;
  identifier?: string;
  /**
   * TTL in seconds of the get/getBundle cache.
   *
   * @default 300
   */
  cacheTtlSeconds?: number;
  /**
   * Renew a lease at ttl * ratio; must be within (0, 1].
   *
   * @default 0.66
   */
  renewBeforeRatio?: number;
  clock?: IClock;
  timers?: ITimerAdapter;
}
