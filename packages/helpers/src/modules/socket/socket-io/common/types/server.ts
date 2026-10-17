import { type RuntimeModules } from '@/common/constants';
import { type IRedisHelper } from '@/modules/redis';
import { type Server as HTTPServer } from 'node:http';
import type { ServerOptions } from 'socket.io';
import {
  type TSocketIOAuthenticateFn,
  type TSocketIOClientConnectedFn,
  type TSocketIOValidateRoomFn,
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
