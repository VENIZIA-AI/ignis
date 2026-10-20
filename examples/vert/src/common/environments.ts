import { EnvironmentKeys as BaseEnvironmentKeys } from '@venizia/ignis';

/** The framework's variables plus the ones this application reads. */
export class EnvironmentKeys extends BaseEnvironmentKeys {
  // JWKS: the ES256 key pair that signs and verifies tokens
  static readonly APP_ENV_JWKS_ALGORITHM = 'APP_ENV_JWKS_ALGORITHM';
  static readonly APP_ENV_JWKS_KID = 'APP_ENV_JWKS_KID';
  static readonly APP_ENV_JWKS_KEY_DRIVER = 'APP_ENV_JWKS_KEY_DRIVER';
  static readonly APP_ENV_JWKS_KEY_FORMAT = 'APP_ENV_JWKS_KEY_FORMAT';
  static readonly APP_ENV_JWKS_PRIVATE_KEY = 'APP_ENV_JWKS_PRIVATE_KEY';
  static readonly APP_ENV_JWKS_PUBLIC_KEY = 'APP_ENV_JWKS_PUBLIC_KEY';

  // Redis: the authorization policy cache
  static readonly APP_ENV_AUTHORZ_REDIS_HOST = 'APP_ENV_AUTHORZ_REDIS_HOST';
  static readonly APP_ENV_AUTHORZ_REDIS_PORT = 'APP_ENV_AUTHORZ_REDIS_PORT';
  static readonly APP_ENV_AUTHORZ_REDIS_PASSWORD = 'APP_ENV_AUTHORZ_REDIS_PASSWORD';
  static readonly APP_ENV_AUTHORZ_REDIS_DB = 'APP_ENV_AUTHORZ_REDIS_DB';

  // Runs the repository test suites at boot; refused in production
  static readonly APP_ENV_RUN_REPOSITORY_TESTS = 'APP_ENV_RUN_REPOSITORY_TESTS';
}
