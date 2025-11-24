export class Environment {
  static readonly LOCAL = 'local';
  static readonly DEBUG = 'debug';

  static readonly DEVELOPMENT = 'development';

  static readonly ALPHA = 'alpha';
  static readonly BETA = 'beta';
  static readonly STAGING = 'staging';

  static readonly PRODUCTION = 'production';

  static get current(): string {
    return process.env.NODE_ENV || Environment.DEVELOPMENT;
  }

  static is(opts: { name: string }) {
    return this.current === opts.name;
  }
}

export class EnvironmentKeys {
  static readonly APP_ENV_APPLICATION_NAME = 'APP_ENV_APPLICATION_NAME';
  static readonly APP_ENV_APPLICATION_TIMEZONE = 'APP_ENV_APPLICATION_TIMEZONE';
  static readonly APP_ENV_APPLICATION_SECRET = 'APP_ENV_APPLICATION_SECRET';

  static readonly APP_ENV_LOGGER_FOLDER_PATH = 'APP_ENV_LOGGER_FOLDER_PATH';
  static readonly APP_ENV_APPLICATION_ROLES = 'APP_ENV_APPLICATION_ROLES';

  static readonly APP_ENV_APPLICATION_DS_MIGRATION = 'APP_ENV_APPLICATION_DS_MIGRATION';
  static readonly APP_ENV_APPLICATION_DS_AUTHORIZE = 'APP_ENV_APPLICATION_DS_AUTHORIZE';
  static readonly APP_ENV_APPLICATION_DS_OAUTH2 = 'APP_ENV_APPLICATION_DS_OAUTH2';

  static readonly APP_ENV_OAUTH2_VIEW_FOLDER = 'APP_ENV_OAUTH2_VIEW_FOLDER';

  static readonly APP_ENV_SERVER_HOST = 'APP_ENV_SERVER_HOST';
  static readonly APP_ENV_SERVER_PORT = 'APP_ENV_SERVER_PORT';
  static readonly APP_ENV_SERVER_BASE_PATH = 'APP_ENV_SERVER_BASE_PATH';

  static readonly APP_ENV_DATASOURCE_NAME = 'APP_ENV_DATASOURCE_NAME';
  static readonly APP_ENV_POSTGRES_HOST = 'APP_ENV_POSTGRES_HOST';
  static readonly APP_ENV_POSTGRES_PORT = 'APP_ENV_POSTGRES_PORT';
  static readonly APP_ENV_POSTGRES_USERNAME = 'APP_ENV_POSTGRES_USERNAME';
  static readonly APP_ENV_POSTGRES_PASSWORD = 'APP_ENV_POSTGRES_PASSWORD';
  static readonly APP_ENV_POSTGRES_DATABASE = 'APP_ENV_POSTGRES_DATABASE';
}
