import { TConstValue, ValueOrPromise } from '@/common/types';
import { DefaultRedisHelper } from '@/helpers/redis';
import { TNullable } from '@venizia/ignis-inversion';
import { TWebSocketMessageType, WebSocketClientStates } from './constants';

// -------------------------------------------------------------------------------------------------------------
export interface IWebSocket<T = unknown> {
  readonly data: T;
  readonly remoteAddress: string;
  readonly readyState: number;

  send(
    data: string | ArrayBufferView | ArrayBuffer | SharedArrayBuffer,
    compress?: boolean,
  ): number;
  subscribe(topic: string): void;
  unsubscribe(topic: string): void;
  isSubscribed(topic: string): boolean;
  close(code?: number, reason?: string): void;
  cork(cb: (ws: IWebSocket<T>) => void): void;
}

export interface IBunServer {
  readonly pendingWebSockets: number;
  publish(
    topic: string,
    data: string | ArrayBufferView | ArrayBuffer | SharedArrayBuffer,
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

/** Return type for getBunWebSocketHandler — handlers + config spread for server.reload() */
export interface IBunWebSocketHandler extends IBunWebSocketConfig {
  open: (socket: IWebSocket) => void;
  message: (socket: IWebSocket, message: string | Buffer) => void;
  close: (socket: IWebSocket, code: number, reason: string) => void;
  drain: (socket: IWebSocket) => void;
}

// -------------------------------------------------------------------------------------------------------------
// Wire Protocol Types
// -------------------------------------------------------------------------------------------------------------

/** Client <-> Server message envelope */
export interface IWebSocketMessage<DataType = unknown> {
  event: string;
  data?: DataType;
  id?: string;
}

/** Internal Redis pub/sub message envelope */
export interface IRedisSocketMessage<DataType = unknown> {
  serverId: string;
  type: TWebSocketMessageType;
  target?: string;
  event: string;
  data: DataType;
  exclude?: string[];
}

// -------------------------------------------------------------------------------------------------------------
// Client Tracking
// -------------------------------------------------------------------------------------------------------------
export type TWebSocketClientState = TConstValue<typeof WebSocketClientStates>;

export interface IWebSocketClient<
  MetadataType extends Record<string, unknown> = Record<string, unknown>,
> {
  id: string;
  userId?: string;
  socket: IWebSocket;
  state: TWebSocketClientState;
  rooms: Set<string>;
  backpressured: boolean;
  encrypted: boolean;
  connectedAt: number;
  lastActivity: number;
  metadata?: MetadataType;
  serverPublicKey?: string;
  salt?: string;
  authTimer?: ReturnType<typeof setTimeout>;
}

// -------------------------------------------------------------------------------------------------------------
// WebSocket Data (attached during server.upgrade)
// -------------------------------------------------------------------------------------------------------------
export interface IWebSocketData<
  MetadataType extends Record<string, unknown> = Record<string, unknown>,
> {
  clientId: string;
  userId?: string;
  metadata?: MetadataType;
}

// -------------------------------------------------------------------------------------------------------------
// Callback Types
// -------------------------------------------------------------------------------------------------------------
export type TWebSocketAuthenticateFn<
  AuthDataType extends Record<string, unknown> = Record<string, unknown>,
  MetadataType extends Record<string, unknown> = Record<string, unknown>,
> = (
  opts: AuthDataType,
) => ValueOrPromise<{ userId?: string; metadata?: MetadataType } | null | false>;

export type TWebSocketHandshakeFn<
  AuthDataType extends Record<string, unknown> = Record<string, unknown>,
> = (opts: {
  clientId: string;
  userId?: string;
  data: AuthDataType;
}) => ValueOrPromise<{ serverPublicKey: string; salt: string } | null | false>;

export type TWebSocketValidateRoomFn = (opts: {
  clientId: string;
  userId?: string;
  rooms: string[];
}) => ValueOrPromise<string[]>;

export type TWebSocketClientConnectedFn<
  MetadataType extends Record<string, unknown> = Record<string, unknown>,
> = (opts: { clientId: string; userId?: string; metadata?: MetadataType }) => ValueOrPromise<void>;

export type TWebSocketClientDisconnectedFn = (opts: {
  clientId: string;
  userId?: string;
}) => ValueOrPromise<void>;

export type TWebSocketMessageHandler = (opts: {
  clientId: string;
  userId?: string;
  message: IWebSocketMessage;
}) => ValueOrPromise<void>;

export type TWebSocketOutboundTransformer<
  DataType = unknown,
  MetadataType extends Record<string, unknown> = Record<string, unknown>,
> = (opts: {
  client: IWebSocketClient<MetadataType>;
  event: string;
  data: DataType;
}) => ValueOrPromise<TNullable<{ event: string; data: DataType }>>;

// -------------------------------------------------------------------------------------------------------------
// Server Options (Bun only)
// -------------------------------------------------------------------------------------------------------------
export interface IWebSocketServerOptions<
  AuthDataType extends Record<string, unknown> = Record<string, unknown>,
  MetadataType extends Record<string, unknown> = Record<string, unknown>,
> {
  identifier: string;
  path?: string; // Default: '/ws'
  redisConnection: DefaultRedisHelper;
  server: IBunServer;
  defaultRooms?: string[];
  serverOptions?: IBunWebSocketConfig;
  authTimeout?: number; // Default: 5_000 (5s to authenticate or disconnect)
  heartbeatInterval?: number; // Default: 30_000 (30s between heartbeats)
  heartbeatTimeout?: number; // Default: 90_000 (3x interval — disconnect after 3 missed heartbeats)
  encryptedBatchLimit?: number; // Default: 10 (max concurrent encryption operations)
  requireEncryption?: boolean; // Default: false — when true, clients must complete handshake during auth or get rejected (4004)

  // Hooks
  authenticateFn: TWebSocketAuthenticateFn<AuthDataType, MetadataType>;
  validateRoomFn?: TWebSocketValidateRoomFn;
  clientConnectedFn?: TWebSocketClientConnectedFn<MetadataType>;
  clientDisconnectedFn?: TWebSocketClientDisconnectedFn;
  messageHandler?: TWebSocketMessageHandler;
  outboundTransformer?: TWebSocketOutboundTransformer<unknown, MetadataType>;
  handshakeFn?: TWebSocketHandshakeFn<AuthDataType>; // Required when requireEncryption is true
}

// -------------------------------------------------------------------------------------------------------------
// Emitter Options
// -------------------------------------------------------------------------------------------------------------
export interface IWebSocketEmitterOptions {
  identifier?: string;
  redisConnection: DefaultRedisHelper;
}
