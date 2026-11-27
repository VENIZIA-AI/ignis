import { type IRedisHelper } from '@/modules/redis';
import { type IWebSocket, type IWebSocketData } from './client';
import {
  type TWebSocketAuthOptions,
  type TWebSocketClientConnectedFn,
  type TWebSocketClientDisconnectedFn,
  type TWebSocketMessageHandler,
  type TWebSocketOutboundTransformer,
  type TWebSocketValidateRoomFn,
} from './hooks';

/** The subset of a Bun server the WebSocket helper uses to publish to topics. */
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
  open: (socket: IWebSocket<IWebSocketData>) => void;
  message: (socket: IWebSocket<IWebSocketData>, message: string | Buffer) => void;
  close: (socket: IWebSocket<IWebSocketData>, code: number, reason: string) => void;
  drain: (socket: IWebSocket<IWebSocketData>) => void;
}

/** The options of `WebSocketServerHelper` that do not concern authentication. Timeouts and intervals are milliseconds. */
export interface IWebSocketServerBaseOptions<
  MetadataType extends Record<string, unknown> = Record<string, unknown>,
> {
  identifier: string;
  /** @default '/ws' */
  path?: string;
  redisConnection: IRedisHelper;
  server: IBunServer;
  /** @default [WebSocketDefaults.ROOM, WebSocketDefaults.NOTIFICATION_ROOM] */
  defaultRooms?: string[];
  serverOptions?: IBunWebSocketConfig;
  /**
   * Time a client has to authenticate before it is disconnected.
   *
   * @default 5_000
   */
  authTimeout?: number;
  /**
   * Time between heartbeats.
   *
   * @default 30_000
   */
  heartbeatInterval?: number;
  /**
   * Time without a heartbeat before the client is disconnected (3 missed heartbeats at the default interval).
   *
   * @default 90_000
   */
  heartbeatTimeout?: number;
  /**
   * Maximum concurrent encryption operations.
   *
   * @default 10
   */
  encryptedBatchLimit?: number;
  /**
   * When true, clients must complete the handshake during authentication or are rejected (4004).
   *
   * @default false
   */
  requireEncryption?: boolean;

  validateRoomFn?: TWebSocketValidateRoomFn;
  clientConnectedFn?: TWebSocketClientConnectedFn<MetadataType>;
  clientDisconnectedFn?: TWebSocketClientDisconnectedFn;
  messageHandler?: TWebSocketMessageHandler;
  outboundTransformer?: TWebSocketOutboundTransformer<unknown, MetadataType>;
}

/** Options for `WebSocketServerHelper`. `handshakeFn` is required when `requireEncryption` is true. */
export type TWebSocketServerOptions<
  AuthDataType extends Record<string, unknown> = Record<string, unknown>,
  MetadataType extends Record<string, unknown> = Record<string, unknown>,
> = IWebSocketServerBaseOptions<MetadataType> & TWebSocketAuthOptions<AuthDataType, MetadataType>;

/** Options for `WebSocketEmitter`. */
export interface IWebSocketEmitterOptions {
  identifier?: string;
  redisConnection: IRedisHelper;
}
