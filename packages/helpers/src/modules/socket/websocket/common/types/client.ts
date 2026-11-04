import { type TConstValue } from '@/common/types';
import { type WebSocketClientStates } from '../constants';

/** The subset of a Bun server WebSocket the helpers use; `data` holds the per-connection data attached at upgrade. */
export interface IWebSocket<T = unknown> {
  readonly data: T;
  readonly remoteAddress: string;
  readonly readyState: number;

  // Bun accepts TypedArray | DataView | ArrayBuffer | SharedArrayBuffer | string; a bare ArrayBufferView is wider than that.
  send(
    data: string | ArrayBuffer | SharedArrayBuffer | Uint8Array | DataView,
    compress?: boolean,
  ): number;
  subscribe(topic: string): void;
  unsubscribe(topic: string): void;
  isSubscribed(topic: string): boolean;
  close(code?: number, reason?: string): void;
  cork(callback: (ws: IWebSocket<T>) => void): void;
}

/** One of the `WebSocketClientStates` values. */
export type TWebSocketClientState = TConstValue<typeof WebSocketClientStates>;

/** A connected WebSocket client as tracked by the server helper. `connectedAt` and `lastActivity` are timestamps; `backpressured` is set while the socket cannot accept more data. */
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

/** Per-connection data attached to a socket when it is upgraded, linking it back to its client record. */
export interface IWebSocketData<
  MetadataType extends Record<string, unknown> = Record<string, unknown>,
> {
  clientId: string;
  userId?: string;
  metadata?: MetadataType;
}
