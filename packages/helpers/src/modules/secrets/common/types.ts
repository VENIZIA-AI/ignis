import type { AnyObject, IConfigurable, ValueOrPromise } from '@/common/types';
import type { TSecretProvider } from './constants';

/** A dynamic, lease-bearing secret (e.g. Vault `database/creds/...`). */
export interface ISecretLease {
  value: Record<string, string>;
  leaseId: string;
  ttlSeconds: number;
  renewable: boolean;
}

export interface ISecretRotationEvent {
  key: string;
  lease: ISecretLease;
}

export type TSecretRotationHandler = (event: ISecretRotationEvent) => ValueOrPromise<void>;

/** A live consumer (pool holder) that rebuilds gracefully when its secret rotates. */
export interface ISecretRotatable {
  onSecretRotated(opts: { key: string; secret: Record<string, string> }): Promise<void>;
}

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

export interface ISecretHydrateEntry {
  path: string;
  prefix?: string;
  /** Explicit vaultKey -> envKey overrides. Takes precedence over `prefix`. */
  keys?: Record<string, string>;
}

export interface ISecretLeaseEntry {
  /** Logical/binding key of the consuming datasource, e.g. 'datasources.postgres'. */
  key: string;
  path: string;
}

export interface ISecretsRegistration {
  provider: TSecretProvider;
  config?: AnyObject;
  hydrate?: Array<ISecretHydrateEntry>;
  lease?: Array<ISecretLeaseEntry>;
  /** Renew a lease at ttl * ratio. Default 0.66. */
  renewBeforeRatio?: number;
  /** TTL (seconds) for the static get/getBundle cache. Default 300. */
  cacheTtlSeconds?: number;
}

/** Injectable clock so tests advance time deterministically. */
export interface IClock {
  now(): number;
}

export type TTimerHandle = ReturnType<typeof setTimeout> | number | object;

/** Injectable timer seam so tests fire renewals without real waits. */
export interface ITimerAdapter {
  set(handler: () => void, ms: number): TTimerHandle;
  clear(handle: TTimerHandle): void;
}

export interface ISecretsHelperOptions {
  scope: string;
  identifier?: string;
  cacheTtlSeconds?: number;
  renewBeforeRatio?: number;
  clock?: IClock;
  timers?: ITimerAdapter;
}
