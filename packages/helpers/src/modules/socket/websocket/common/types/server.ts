import { IRedisHelper } from '@/modules/redis';
import { IWebSocket } from './client';
import {
  TWebSocketAuthenticateFn,
  TWebSocketClientConnectedFn,
  TWebSocketClientDisconnectedFn,
  TWebSocketHandshakeFn,
  TWebSocketMessageHandler,
  TWebSocketOutboundTransformer,
  TWebSocketValidateRoomFn,
} from './hooks';

export interface IBunServer {
  readonly pendingWebSockets: number;
  publish(
    topic: string,
    data: string | ArrayBuffer | SharedArrayBuffer | Uint8Array | DataView,
    compress?: boolean,
  ): number;
}

/** Bun WebSocket native configuration options */
export interface IBunWebSocketConfig {
  perMessageDeflate?: boolean;
  maxPayloadLength?: number;
  idleTimeout?: number;
  backpressureLimit?: number;
  closeOnBackpressureLimit?: boolean;
  sendPings?: boolean;
  publishToSelf?: boolean;
}

/** Return type for getBunWebSocketHandler - handlers + config spread for server.reload() */
export interface IBunWebSocketHandler extends IBunWebSocketConfig {
  open: (socket: IWebSocket) => void;
  message: (socket: IWebSocket, message: string | Buffer) => void;
  close: (socket: IWebSocket, code: number, reason: string) => void;
  drain: (socket: IWebSocket) => void;
}

export interface IWebSocketServerOptions<
  AuthDataType extends Record<string, unknown> = Record<string, unknown>,
  MetadataType extends Record<string, unknown> = Record<string, unknown>,
> {
  identifier: string;
  path?: string; // Default: '/ws'
  redisConnection: IRedisHelper;
  server: IBunServer;
  defaultRooms?: string[];
  serverOptions?: IBunWebSocketConfig;
  authTimeout?: number; // Default: 5_000 (5s to authenticate or disconnect)
  heartbeatInterval?: number; // Default: 30_000 (30s between heartbeats)
  heartbeatTimeout?: number; // Default: 90_000 (3x interval — disconnect after 3 missed heartbeats)
  encryptedBatchLimit?: number; // Default: 10 (max concurrent encryption operations)
  requireEncryption?: boolean; // Default: false — when true, clients must complete handshake during auth or get rejected (4004)

  authenticateFn: TWebSocketAuthenticateFn<AuthDataType, MetadataType>;
  validateRoomFn?: TWebSocketValidateRoomFn;
  clientConnectedFn?: TWebSocketClientConnectedFn<MetadataType>;
  clientDisconnectedFn?: TWebSocketClientDisconnectedFn;
  messageHandler?: TWebSocketMessageHandler;
  outboundTransformer?: TWebSocketOutboundTransformer<unknown, MetadataType>;
  handshakeFn?: TWebSocketHandshakeFn<AuthDataType>; // Required when requireEncryption is true
}

export interface IWebSocketEmitterOptions {
  identifier?: string;
  redisConnection: IRedisHelper;
}
