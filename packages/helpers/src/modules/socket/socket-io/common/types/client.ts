import { TConstValue, ValueOrPromise } from '@/common/types';
import { IncomingHttpHeaders } from 'node:http';
import { ParsedUrlQuery } from 'node:querystring';
import type { Socket as IOSocket } from 'socket.io';
import type { SocketOptions } from 'socket.io-client';
import { SocketIOClientStates } from '../constants';

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
    [key: string]: any;
  };
}

export type TSocketIOClientState = TConstValue<typeof SocketIOClientStates>;

export interface ISocketIOClient {
  id: string;
  socket: IOSocket;
  state: TSocketIOClientState;
  interval?: NodeJS.Timeout;
  authenticateTimeout?: NodeJS.Timeout;
}

export interface IOptions extends SocketOptions {
  path: string;
  extraHeaders: Record<string | symbol | number, any>;
}

export interface ISocketIOClientOptions {
  identifier: string;
  host: string;
  options: IOptions;

  onConnected?: () => ValueOrPromise<void>;
  onDisconnected?: (reason: string) => ValueOrPromise<void>;
  onError?: (error: Error) => ValueOrPromise<void>;
  onAuthenticated?: () => ValueOrPromise<void>;
  onUnauthenticated?: (message: string) => ValueOrPromise<void>;
}
