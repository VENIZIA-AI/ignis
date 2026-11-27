import type { IRedisHelper } from '@venizia/ignis-helpers';
import type {
  TSocketIOAuthenticateFn,
  TSocketIOClientConnectedFn,
  TSocketIOValidateRoomFn,
} from '@venizia/ignis-helpers/socket-io';
import type { ServerOptions } from 'socket.io';

/** Socket.IO's server options, plus the component's own `identifier` (default `SOCKET_IO_SERVER`): the server helper's name. */
export interface IServerOptions extends ServerOptions {
  identifier: string;
}

/** The server helper's name when the bound options give none. */
export const DEFAULT_SERVER_IDENTIFIER = 'SOCKET_IO_SERVER';

export const DEFAULT_SERVER_OPTIONS: Partial<IServerOptions> = {
  identifier: DEFAULT_SERVER_IDENTIFIER,
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
  redisConnection: IRedisHelper;
  authenticateFn: TSocketIOAuthenticateFn;
  validateRoomFn?: TSocketIOValidateRoomFn;
  clientConnectedFn?: TSocketIOClientConnectedFn;
}
