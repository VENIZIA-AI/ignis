import { type RuntimeModules } from '@/common/constants';
import { type IRedisHelper } from '@/modules/redis';
import type { ServerOptions } from 'socket.io';
import {
  type TSocketIOAuthenticateFn,
  type TSocketIOClientConnectedFn,
  type TSocketIOValidateRoomFn,
} from './hooks';

/** Options shared by every Socket.IO server runtime. `authenticateTimeout` and `pingInterval` are milliseconds. */
export interface ISocketIOServerBaseOptions {
  identifier: string;
  serverOptions: Partial<ServerOptions>;
  redisConnection: IRedisHelper;
  /** @default [SocketIOConstants.ROOM_DEFAULT, SocketIOConstants.ROOM_NOTIFICATION] */
  defaultRooms?: string[];
  /** @default 10_000 */
  authenticateTimeout?: number;
  /** @default 30_000 */
  pingInterval?: number;

  authenticateFn: TSocketIOAuthenticateFn;
  validateRoomFn?: TSocketIOValidateRoomFn;
  clientConnectedFn?: TSocketIOClientConnectedFn;
}

/** A `@socket.io/bun-engine` server. Socket.IO types what `io.bind` takes as `any` and the engine is an optional peer, so the helper names only that it is an object it passes on. */
export type TSocketIOBunEngine = object;

/** Socket.IO server options for the Bun runtime; `engine` is a `@socket.io/bun-engine` server instance. */
export interface ISocketIOServerBunOptions extends ISocketIOServerBaseOptions {
  runtime: typeof RuntimeModules.BUN;
  engine: TSocketIOBunEngine;
}

/** Options accepted by `SocketIOServerHelper`. */
export type TSocketIOServerOptions = ISocketIOServerBunOptions;
