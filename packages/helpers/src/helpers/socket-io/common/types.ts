import { RuntimeModules } from '@/common/constants';
import { TConstValue, ValueOrPromise } from '@/common/types';
import { DefaultRedisHelper } from '@/helpers/redis';
import { Server as HTTPServer, IncomingHttpHeaders } from 'node:http';
import { ParsedUrlQuery } from 'node:querystring';
import { Socket as IOSocket, ServerOptions } from 'socket.io';
import { SocketOptions } from 'socket.io-client';
import { SocketIOClientStates } from './constants';

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

// ------------------------------------------------------------
export type TSocketIOClientState = TConstValue<typeof SocketIOClientStates>;

export interface ISocketIOClient {
  id: string;
  socket: IOSocket;
  state: TSocketIOClientState;
  interval?: NodeJS.Timeout;
  authenticateTimeout: NodeJS.Timeout;
}

// ------------------------------------------------------------
export interface IOptions extends SocketOptions {
  path: string;
  extraHeaders: Record<string | symbol | number, any>;
}

export interface ISocketIOClientOptions {
  identifier: string;
  host: string;
  options: IOptions;

  // Lifecycle callbacks
  onConnected?: () => ValueOrPromise<void>;
  onDisconnected?: (reason: string) => ValueOrPromise<void>;
  onError?: (error: Error) => ValueOrPromise<void>;
  onAuthenticated?: () => ValueOrPromise<void>;
  onUnauthenticated?: (message: string) => ValueOrPromise<void>;
}

// ------------------------------------------------------------
export type TSocketIOEventHandler<T = unknown> = (data: T) => ValueOrPromise<void>;
export type TSocketIOAuthenticateFn = (args: IHandshake) => ValueOrPromise<boolean>;
export type TSocketIOValidateRoomFn = (opts: { socket: IOSocket; rooms: string[] }) => ValueOrPromise<string[]>;
export type TSocketIOClientConnectedFn = (opts: { socket: IOSocket }) => ValueOrPromise<void>;

// ------------------------------------------------------------
export interface ISocketIOServerBaseOptions {
  identifier: string;
  serverOptions: Partial<ServerOptions>;
  redisConnection: DefaultRedisHelper;
  defaultRooms?: string[];
  authenticateTimeout?: number;
  pingInterval?: number;

  authenticateFn: TSocketIOAuthenticateFn;
  validateRoomFn?: TSocketIOValidateRoomFn;
  clientConnectedFn?: TSocketIOClientConnectedFn;
}

export interface ISocketIOServerNodeOptions extends ISocketIOServerBaseOptions {
  runtime: typeof RuntimeModules.NODE;
  server: HTTPServer;
}

export interface ISocketIOServerBunOptions extends ISocketIOServerBaseOptions {
  runtime: typeof RuntimeModules.BUN;
  engine: any; // @socket.io/bun-engine Server instance — typed as any since it's an optional peer dep
}

export type TSocketIOServerOptions = ISocketIOServerNodeOptions | ISocketIOServerBunOptions;
