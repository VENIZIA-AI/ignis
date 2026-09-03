import { RuntimeModules } from '@/common/constants';
import { IRedisHelper } from '@/modules/redis';
import { Server as HTTPServer } from 'node:http';
import type { ServerOptions } from 'socket.io';
import {
  TSocketIOAuthenticateFn,
  TSocketIOClientConnectedFn,
  TSocketIOValidateRoomFn,
} from './hooks';

export interface ISocketIOServerBaseOptions {
  identifier: string;
  serverOptions: Partial<ServerOptions>;
  redisConnection: IRedisHelper;
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
