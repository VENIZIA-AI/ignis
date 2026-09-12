/**
 * Environment variable names.
 *
 * The two groups mean different things and the split is load-bearing: a name in the second group
 * is a CONVENTION an application reads for itself, and setting it changes nothing in IGNIS. Every
 * name here was once presented as framework configuration, which is how a deployment came to set
 * `APP_ENV_APPLICATION_DS_MIGRATION` against a framework that read `APP_ENV_DS_MIGRATION` - and
 * neither name selected anything, so both are gone.
 *
 * A name earns its place by having a reader. `APP_ENV_OAUTH2_VIEW_FOLDER` and
 * `APP_ENV_DATASOURCE_NAME` had none in either IGNIS or its consumers, only entries in `.env` files
 * nobody consulted, so they went the same way. Before adding one here, know who reads it.
 */
export class EnvironmentKeys {
  // --- Read by the framework -------------------------------------------------------------------

  /** `AppConstants.APPLICATION_NAME` and the startup banner. */
  static readonly APP_ENV_APPLICATION_NAME = 'APP_ENV_APPLICATION_NAME';
  /** `DateUtility`'s default zone and the startup banner. */
  static readonly APP_ENV_APPLICATION_TIMEZONE = 'APP_ENV_APPLICATION_TIMEZONE';
  /** Set it to enable rotating file logs; unset means console. Also the startup banner. */
  static readonly APP_ENV_LOGGER_FOLDER_PATH = 'APP_ENV_LOGGER_FOLDER_PATH';
  /** Fallback host when `IApplicationConfigs.host` is absent. */
  static readonly APP_ENV_SERVER_HOST = 'APP_ENV_SERVER_HOST';
  /** Fallback port when `IApplicationConfigs.port` is absent. */
  static readonly APP_ENV_SERVER_PORT = 'APP_ENV_SERVER_PORT';

  // --- Convention only: nothing in IGNIS reads these ---------------------------------------------

  static readonly APP_ENV_APPLICATION_SECRET = 'APP_ENV_APPLICATION_SECRET';
  static readonly APP_ENV_APPLICATION_ROLES = 'APP_ENV_APPLICATION_ROLES';

  static readonly APP_ENV_JWT_SECRET = 'APP_ENV_JWT_SECRET';
  static readonly APP_ENV_JWT_EXPIRES_IN = 'APP_ENV_JWT_EXPIRES_IN';

  static readonly APP_ENV_SERVER_BASE_PATH = 'APP_ENV_SERVER_BASE_PATH';

  static readonly APP_ENV_POSTGRES_HOST = 'APP_ENV_POSTGRES_HOST';
  static readonly APP_ENV_POSTGRES_PORT = 'APP_ENV_POSTGRES_PORT';
  static readonly APP_ENV_POSTGRES_USERNAME = 'APP_ENV_POSTGRES_USERNAME';
  static readonly APP_ENV_POSTGRES_PASSWORD = 'APP_ENV_POSTGRES_PASSWORD';
  static readonly APP_ENV_POSTGRES_DATABASE = 'APP_ENV_POSTGRES_DATABASE';
}
