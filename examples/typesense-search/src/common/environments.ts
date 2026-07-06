import { EnvironmentKeys as BaseEnv } from '@venizia/ignis';

export class EnvironmentKeys extends BaseEnv {
  /** Comma-separated `host:port` list - takes precedence over HOST/PORT for cluster setups. */
  static readonly APP_ENV_TYPESENSE_NODES = 'APP_ENV_TYPESENSE_NODES';
  static readonly APP_ENV_TYPESENSE_HOST = 'APP_ENV_TYPESENSE_HOST';
  static readonly APP_ENV_TYPESENSE_PORT = 'APP_ENV_TYPESENSE_PORT';
  static readonly APP_ENV_TYPESENSE_PROTOCOL = 'APP_ENV_TYPESENSE_PROTOCOL';
  static readonly APP_ENV_TYPESENSE_API_KEY = 'APP_ENV_TYPESENSE_API_KEY';
}
