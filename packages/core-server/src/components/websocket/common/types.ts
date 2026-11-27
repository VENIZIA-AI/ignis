import type {
  IRedisHelper,
  IBunWebSocketConfig,
  TWebSocketAuthenticateFn,
  TWebSocketClientConnectedFn,
  TWebSocketClientDisconnectedFn,
  TWebSocketHandshakeFn,
  TWebSocketMessageHandler,
  TWebSocketOutboundTransformer,
  TWebSocketValidateRoomFn,
} from '@venizia/ignis-helpers';
import { WebSocketDefaults } from '@venizia/ignis-helpers';
import type { z } from '@hono/zod-openapi';

export interface IServerOptions {
  identifier: string;
  path?: string;
  defaultRooms?: string[];
  serverOptions?: IBunWebSocketConfig;
  heartbeatInterval?: number;
  heartbeatTimeout?: number;
  requireEncryption?: boolean;
}

export const DEFAULT_SERVER_OPTIONS: IServerOptions = {
  identifier: 'WEBSOCKET_SERVER',
  path: WebSocketDefaults.PATH,
};

export interface IResolvedBindings {
  redisConnection: IRedisHelper;
  authSchema?: z.ZodType<Record<string, unknown>>;
  authenticateFn: TWebSocketAuthenticateFn;
  validateRoomFn?: TWebSocketValidateRoomFn;
  clientConnectedFn?: TWebSocketClientConnectedFn;
  clientDisconnectedFn?: TWebSocketClientDisconnectedFn;
  messageHandler?: TWebSocketMessageHandler;
  outboundTransformer?: TWebSocketOutboundTransformer;
  handshakeFn?: TWebSocketHandshakeFn;
}
