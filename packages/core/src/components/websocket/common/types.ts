import type {
  DefaultRedisHelper,
  IBunWebSocketConfig,
  TWebSocketAuthenticateFn,
  TWebSocketClientConnectedFn,
  TWebSocketClientDisconnectedFn,
  TWebSocketMessageHandler,
  TWebSocketValidateRoomFn,
} from '@venizia/ignis-helpers';
import { WebSocketDefaults } from '@venizia/ignis-helpers';

export interface IServerOptions {
  identifier: string;
  path?: string;
  defaultRooms?: string[];
  serverOptions?: IBunWebSocketConfig;
  heartbeatInterval?: number;
  heartbeatTimeout?: number;
}

export const DEFAULT_SERVER_OPTIONS: IServerOptions = {
  identifier: 'WEBSOCKET_SERVER',
  path: WebSocketDefaults.PATH,
};

export interface IResolvedBindings {
  redisConnection: DefaultRedisHelper;
  authenticateFn: TWebSocketAuthenticateFn;
  validateRoomFn?: TWebSocketValidateRoomFn;
  clientConnectedFn?: TWebSocketClientConnectedFn;
  clientDisconnectedFn?: TWebSocketClientDisconnectedFn;
  messageHandler?: TWebSocketMessageHandler;
}
