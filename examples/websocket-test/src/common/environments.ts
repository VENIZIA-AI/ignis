import { EnvironmentKeys as BaseEnv } from '@venizia/ignis';

export class EnvironmentKeys extends BaseEnv {
  // Redis for WebSocket
  static readonly APP_ENV_REDIS_WS_HOST = 'APP_ENV_REDIS_WS_HOST';
  static readonly APP_ENV_REDIS_WS_PORT = 'APP_ENV_REDIS_WS_PORT';
  static readonly APP_ENV_REDIS_WS_PASSWORD = 'APP_ENV_REDIS_WS_PASSWORD';
  static readonly APP_ENV_REDIS_WS_MODE = 'APP_ENV_REDIS_WS_MODE';
}
