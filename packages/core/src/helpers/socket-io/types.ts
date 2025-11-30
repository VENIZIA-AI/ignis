import { IncomingHttpHeaders } from 'node:http';
import { ParsedUrlQuery } from 'node:querystring';
import { SocketOptions } from 'socket.io-client';
import { Server as HTTPServer } from 'node:http';
import { Socket as IOSocket, ServerOptions } from 'socket.io';
import { DefaultRedisHelper } from '@/helpers/redis';

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
export interface IOptions extends SocketOptions {
  path: string;
  extraHeaders: Record<string | symbol | number, any>;
}

export interface ISocketIOClientOptions {
  identifier: string;
  host: string;
  options: IOptions;
}

// ------------------------------------------------------------
export interface ISocketIOServerOptions {
  identifier: string;
  server: HTTPServer;
  serverOptions: Partial<ServerOptions>;

  redisConnection: DefaultRedisHelper;

  authenticateFn: (args: IHandshake) => Promise<boolean>;
  clientConnectedFn: (opts: { socket: IOSocket }) => Promise<void>;
  authenticateTimeout?: number;
  defaultRooms?: string[];
}
