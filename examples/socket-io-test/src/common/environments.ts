import { EnvironmentKeys as BaseEnv } from '@venizia/ignis';

export class EnvironmentKeys extends BaseEnv {
  // Redis for Socket.IO
  static readonly APP_ENV_REDIS_SOCKETIO_HOST = 'APP_ENV_REDIS_SOCKETIO_HOST';
  static readonly APP_ENV_REDIS_SOCKETIO_PORT = 'APP_ENV_REDIS_SOCKETIO_PORT';
  static readonly APP_ENV_REDIS_SOCKETIO_PASSWORD = 'APP_ENV_REDIS_SOCKETIO_PASSWORD';
  static readonly APP_ENV_REDIS_SOCKETIO_MODE = 'APP_ENV_REDIS_SOCKETIO_MODE';
}
