import { TConstValue, ValueOrPromise } from '@/common/types';
import { DefaultRedisHelper } from '@/helpers/redis';
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

export interface IWebSocketClient<MetadataType = Record<string, unknown>> {
  id: string;
  userId?: string;
  socket: IWebSocket;
  state: TWebSocketClientState;
  rooms: Set<string>;
  backpressured: boolean;
  connectedAt: number;
  lastActivity: number;
  metadata?: MetadataType;
  authTimer?: ReturnType<typeof setTimeout>;
}

// -------------------------------------------------------------------------------------------------------------
// WebSocket Data (attached during server.upgrade)
// -------------------------------------------------------------------------------------------------------------
export interface IWebSocketData<MetadataType = Record<string, unknown>> {
  clientId: string;
  userId?: string;
  metadata?: MetadataType;
}

// -------------------------------------------------------------------------------------------------------------
// Authentication (post-connection, Socket.IO pattern)
// -------------------------------------------------------------------------------------------------------------

/**
 * User-provided function to authenticate WebSocket clients after connection.
 * Called when client sends { event: 'authenticate', data: { token, ... } }.
 * Return object with userId (or other metadata) on success, or null/false to reject.
 */
export type TWebSocketAuthenticateFn = (
  data: Record<string, unknown>,
) => ValueOrPromise<{ userId?: string; metadata?: Record<string, unknown> } | null | false>;

// -------------------------------------------------------------------------------------------------------------
// Callback Types
// -------------------------------------------------------------------------------------------------------------
export type TWebSocketValidateRoomFn = (opts: {
  clientId: string;
  userId?: string;
  rooms: string[];
}) => ValueOrPromise<string[]>;

export type TWebSocketClientConnectedFn = (opts: {
  clientId: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}) => ValueOrPromise<void>;

export type TWebSocketClientDisconnectedFn = (opts: {
  clientId: string;
  userId?: string;
}) => ValueOrPromise<void>;

export type TWebSocketMessageHandler = (opts: {
  clientId: string;
  userId?: string;
  message: IWebSocketMessage;
}) => ValueOrPromise<void>;

// -------------------------------------------------------------------------------------------------------------
// Server Options (Bun only)
// -------------------------------------------------------------------------------------------------------------
export interface IWebSocketServerOptions {
  identifier: string;
  path?: string; // Default: '/ws'
  redisConnection: DefaultRedisHelper;
  server: IBunServer;
  defaultRooms?: string[];
  serverOptions?: IBunWebSocketConfig;
  authTimeout?: number; // Default: 5_000 (5s to authenticate or disconnect)
  heartbeatInterval?: number; // Default: 30_000 (30s between heartbeats)
  heartbeatTimeout?: number; // Default: 90_000 (3x interval — disconnect after 3 missed heartbeats)

  // Hooks
  authenticateFn: TWebSocketAuthenticateFn;
  validateRoomFn?: TWebSocketValidateRoomFn;
  clientConnectedFn?: TWebSocketClientConnectedFn;
  clientDisconnectedFn?: TWebSocketClientDisconnectedFn;
  messageHandler?: TWebSocketMessageHandler;
}

// -------------------------------------------------------------------------------------------------------------
// Emitter Options
// -------------------------------------------------------------------------------------------------------------
export interface IWebSocketEmitterOptions {
  identifier?: string;
  redisConnection: DefaultRedisHelper;
}
