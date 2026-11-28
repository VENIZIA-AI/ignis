/** Every environment variable this application reads. See `.env.example`. */
export class EnvKeys {
  static readonly APP_ENV_SERVER_HOST = 'APP_ENV_SERVER_HOST';
  static readonly APP_ENV_SERVER_PORT = 'APP_ENV_SERVER_PORT';
  static readonly APP_ENV_PGLITE_DATA_DIR = 'APP_ENV_PGLITE_DATA_DIR';
  static readonly APP_ENV_JWT_SECRET = 'APP_ENV_JWT_SECRET';
  static readonly APP_ENV_JWT_EXPIRES_IN = 'APP_ENV_JWT_EXPIRES_IN';
  static readonly APP_ENV_DEMO_PASSWORD = 'APP_ENV_DEMO_PASSWORD';
  static readonly APP_ENV_GRPC_HOST = 'APP_ENV_GRPC_HOST';
  static readonly APP_ENV_GRPC_PORT = 'APP_ENV_GRPC_PORT';
  static readonly APP_ENV_GRPC_TLS = 'APP_ENV_GRPC_TLS';
  static readonly APP_ENV_GRPC_TLS_CERT = 'APP_ENV_GRPC_TLS_CERT';
  static readonly APP_ENV_GRPC_TLS_KEY = 'APP_ENV_GRPC_TLS_KEY';
  static readonly APP_ENV_GRPC_MAX_STREAMS = 'APP_ENV_GRPC_MAX_STREAMS';
  static readonly APP_ENV_GRPC_SHUTDOWN_TIMEOUT_MS = 'APP_ENV_GRPC_SHUTDOWN_TIMEOUT_MS';
}
