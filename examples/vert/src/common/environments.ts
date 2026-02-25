import { EnvironmentKeys as BaseEnv } from '@venizia/ignis';

export class EnvironmentKeys extends BaseEnv {
  static readonly APP_ENV_PARSE_RESULT_FOLDER_PATH = 'APP_ENV_PARSE_RESULT_FOLDER_PATH';

  // Minio
  static readonly APP_ENV_MINIO_HOST = 'APP_ENV_MINIO_HOST';
  static readonly APP_ENV_MINIO_API_PORT = 'APP_ENV_MINIO_API_PORT';
  static readonly APP_ENV_MINIO_ACCESS_KEY = 'APP_ENV_MINIO_ACCESS_KEY';
  static readonly APP_ENV_MINIO_SECRET_KEY = 'APP_ENV_MINIO_SECRET_KEY';

  // Authorization Redis
  static readonly APP_ENV_AUTHORZ_REDIS_HOST = 'APP_ENV_AUTHORZ_REDIS_HOST';
  static readonly APP_ENV_AUTHORZ_REDIS_PORT = 'APP_ENV_AUTHORZ_REDIS_PORT';
  static readonly APP_ENV_AUTHORZ_REDIS_PASSWORD = 'APP_ENV_AUTHORZ_REDIS_PASSWORD';
  static readonly APP_ENV_AUTHORZ_REDIS_DB = 'APP_ENV_AUTHORZ_REDIS_DB';
}
