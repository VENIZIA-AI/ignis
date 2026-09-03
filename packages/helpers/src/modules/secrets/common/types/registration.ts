import type { AnyObject } from '@/common/types';
import type { TSecretProvider } from '../constants';

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
