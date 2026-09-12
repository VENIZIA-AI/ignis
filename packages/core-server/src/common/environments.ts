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
 *
 * Two framework variables are deliberately ABSENT from this class, and adding them would be a trap:
 * `APPLICATION_ENV_PREFIX` and `ALLOW_EMPTY_ENV_VALUE`. Neither carries the `APP_ENV` prefix, so
 * `applicationEnvironment` never holds them - a read through `AppEnvs.get()` would answer `undefined`
 * forever. `APPLICATION_ENV_PREFIX` could not go through it in any case: it is what builds the
 * filter. Both are bootstrap variables and are read straight off `process.env`, which is the one
 * legitimate exception to "do not read process.env directly". Neither has to be declared or set:
 * the prefix defaults to `APP_ENV`, and empty values are allowed unless you set
 * `ALLOW_EMPTY_ENV_VALUE` to `false` or `0`.
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
