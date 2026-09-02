import { TConstValue } from '@/common/types';
import { WebSocketClientStates } from '../constants';

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
  cork(callback: (ws: IWebSocket<T>) => void): void;
}

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

export interface IWebSocketData<
  MetadataType extends Record<string, unknown> = Record<string, unknown>,
> {
  clientId: string;
  userId?: string;
  metadata?: MetadataType;
}
