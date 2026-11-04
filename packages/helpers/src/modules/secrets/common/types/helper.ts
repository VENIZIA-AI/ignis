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
  get<TValue = string>(opts: IGetSecretOptions<TValue>): Promise<TValue>;
  getBundle(opts: { path: string }): Promise<Record<string, string>>;
  lease(opts: { path: string; key: string }): Promise<ISecretLease>;
  onRotate(handler: TSecretRotationHandler): void;
  registerRotatable(opts: { key: string; target: ISecretRotatable }): void;
  shutdown(): Promise<void>;
}

/** Constructor options of a secrets provider. `cacheTtlSeconds` defaults to 300 and `renewBeforeRatio` to 0.66; `clock` and `timers` can be replaced in tests. */
export interface ISecretsHelperOptions {
  scope: string;
  identifier?: string;
  cacheTtlSeconds?: number;
  renewBeforeRatio?: number;
  clock?: IClock;
  timers?: ITimerAdapter;
}
