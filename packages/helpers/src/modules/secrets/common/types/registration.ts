import type { IDotenvVaultHelperOptions } from '../../dotenv/dotenv.helper';
import type { IHashiCorpVaultHelperOptions } from '../../hashicorp/hashicorp.helper';
import type { SecretProviders } from '../constants';

/** A bundle at `path` to copy into environment variables; keys map by `prefix` or by explicit `keys`. */
export interface ISecretHydrateEntry {
  path: string;
  prefix?: string;
  /** Explicit vaultKey -> envKey overrides. Takes precedence over `prefix`. */
  keys?: Record<string, string>;
}

/** A leased secret at `path`, registered under the consumer binding `key`. */
export interface ISecretLeaseEntry {
  /** Logical/binding key of the consuming datasource, e.g. 'datasources.postgres'. */
  key: string;
  path: string;
}

/** What every registration carries, whatever its provider. */
interface ISecretsRegistrationBase {
  hydrate?: Array<ISecretHydrateEntry>;
  lease?: Array<ISecretLeaseEntry>;
  /**
   * Renew a lease at ttl * ratio.
   *
   * @default 0.66
   */
  renewBeforeRatio?: number;
  /**
   * TTL (seconds) for the static get/getBundle cache.
   *
   * @default 300
   */
  cacheTtlSeconds?: number;
}

/** The helper options a registration's `config` fills; the registration owns the identifier, the cache TTL and the renewal ratio. */
type TRegistrationConfig<Options> = Omit<
  Options,
  'identifier' | 'cacheTtlSeconds' | 'renewBeforeRatio'
>;

/** Registers the process environment as the provider; it takes no `config`. */
export interface ISystemEnvsSecretsRegistration extends ISecretsRegistrationBase {
  provider: typeof SecretProviders.SYSTEM_ENVS;
  config?: undefined;
}

/** Registers HashiCorp Vault; `config` carries the endpoint and the auth. */
export interface IHashiCorpSecretsRegistration extends ISecretsRegistrationBase {
  provider: typeof SecretProviders.HASHICORP_VAULT;
  config: TRegistrationConfig<IHashiCorpVaultHelperOptions>;
}

/** Registers a dotenv vault file; `config` is optional. */
export interface IDotenvSecretsRegistration extends ISecretsRegistrationBase {
  provider: typeof SecretProviders.DOTENV_VAULT;
  config?: TRegistrationConfig<IDotenvVaultHelperOptions>;
}

/** Declares a secrets provider with the bundles to hydrate and the secrets to lease: the `provider` selects the shape of `config`. */
export type ISecretsRegistration =
  | ISystemEnvsSecretsRegistration
  | IHashiCorpSecretsRegistration
  | IDotenvSecretsRegistration;
