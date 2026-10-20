import type { IConfigurable } from '@/common/types';
import type { ISecretLease, ISecretRotatable, TSecretRotationHandler } from './lease';
import type { IClock, ITimerAdapter } from './timer';

export interface IGetSecretOptions<TValue = string> {
  path: string;
  key?: string;
  defaultValue?: TValue;
}

export interface ISecretsHelper extends IConfigurable {
  get<TValue = string>(opts: IGetSecretOptions<TValue>): Promise<TValue>;
  getBundle(opts: { path: string }): Promise<Record<string, string>>;
  lease(opts: { path: string; key: string }): Promise<ISecretLease>;
  onRotate(handler: TSecretRotationHandler): void;
  registerRotatable(opts: { key: string; target: ISecretRotatable }): void;
  shutdown(): Promise<void>;
}

export interface ISecretsHelperOptions {
  scope: string;
  identifier?: string;
  cacheTtlSeconds?: number;
  renewBeforeRatio?: number;
  clock?: IClock;
  timers?: ITimerAdapter;
}
