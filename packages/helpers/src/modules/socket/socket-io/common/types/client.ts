import { type TConstValue, type ValueOrPromise } from '@/common/types';
import { type IncomingHttpHeaders } from 'node:http';
import { type ParsedUrlQuery } from 'node:querystring';
import type { Socket as IOSocket } from 'socket.io';
import type { SocketOptions } from 'socket.io-client';
import { type SocketIOClientStates } from '../constants';

/** Handshake data of a connecting Socket.IO client; passed to the authenticate hook. */
export interface IHandshake {
  headers: IncomingHttpHeaders;
  time: string;
  address: string;
  xdomain: boolean;
  secure: boolean;
  issued: number;
  url: string;
  query: ParsedUrlQuery;
  auth: {
    [key: string]: unknown;
  };
}

/** One of the `SocketIOClientStates` values. */
export type TSocketIOClientState = TConstValue<typeof SocketIOClientStates>;

/** A connected Socket.IO client as tracked by the server helper, with its authentication state and timers. */
export interface ISocketIOClient {
  id: string;
  socket: IOSocket;
  state: TSocketIOClientState;
  interval?: NodeJS.Timeout;
  authenticateTimeout?: NodeJS.Timeout;
}

/** Connection options for the Socket.IO client helper: the `socket.io-client` options plus a required `path` and `extraHeaders`. */
export interface IOptions extends SocketOptions {
  path: string;
  extraHeaders: Record<string, string>;
}

/** Options for the Socket.IO client helper. The `on*` callbacks fire on the matching connection or authentication event. */
export interface ISocketIOClientOptions {
  identifier: string;
  host: string;
  options: IOptions;

  /** `socket.io-client` itself, for a `bun build --compile` binary that has no `node_modules` to load it from. Omitted, it is loaded on `configure()`. */
  module?: typeof import('socket.io-client');

  onConnected?: () => ValueOrPromise<void>;
  onDisconnected?: (reason: string) => ValueOrPromise<void>;
  onError?: (error: Error) => ValueOrPromise<void>;
  onAuthenticated?: () => ValueOrPromise<void>;
  onUnauthenticated?: (message: string) => ValueOrPromise<void>;
}
