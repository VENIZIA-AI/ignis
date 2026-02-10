import type {
  DefaultRedisHelper,
  TSocketIOAuthenticateFn,
  TSocketIOClientConnectedFn,
  TSocketIOValidateRoomFn,
} from '@venizia/ignis-helpers';
import type { ServerOptions } from 'socket.io';

export interface IServerOptions extends ServerOptions {
  identifier: string;
}

export const DEFAULT_SERVER_OPTIONS: Partial<IServerOptions> = {
  identifier: 'SOCKET_IO_SERVER',
  path: '/io',
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    preflightContinue: false,
    optionsSuccessStatus: 204,
    credentials: true,
  },
  perMessageDeflate: {
    threshold: 4096,
    zlibDeflateOptions: { chunkSize: 10 * 1024 },
    zlibInflateOptions: { windowBits: 12, memLevel: 8 },
    clientNoContextTakeover: true,
    serverNoContextTakeover: true,
    serverMaxWindowBits: 10,
    concurrencyLimit: 20,
  },
};

export interface IResolvedBindings {
  redisConnection: DefaultRedisHelper;
  authenticateFn: TSocketIOAuthenticateFn;
  validateRoomFn?: TSocketIOValidateRoomFn;
  clientConnectedFn?: TSocketIOClientConnectedFn;
}
