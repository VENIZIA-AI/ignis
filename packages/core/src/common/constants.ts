// ------------------------------------------------------------------------------
export class App {
  static readonly APPLICATION_NAME = process.env.APP_ENV_APPLICATION_NAME ?? 'APP';

  static readonly DEFAULT_QUERY_LIMIT = 50;
  static readonly DEFAULT_QUERY_OFFSET = 0;

  static readonly DS_POSTGRES = 'postgresql';
  static readonly DS_MEMORY = 'memory';
  static readonly DS_REDIS = 'redis';
}
