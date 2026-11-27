import { BindingKeys } from '@venizia/ignis-inversion';
import type { IRedisHelper } from '@venizia/ignis-helpers';
import type {
  SocketIOServerHelper,
  TSocketIOAuthenticateFn,
  TSocketIOClientConnectedFn,
  TSocketIOValidateRoomFn,
} from '@venizia/ignis-helpers/socket-io';
import type { IServerOptions } from './types';

/** Container keys of the Socket.IO component: the server instance, its options, the Redis connection and the handlers an application binds. */
export class SocketIOBindingKeys {
  static readonly SOCKET_IO_INSTANCE = BindingKeys.build<SocketIOServerHelper>({
    key: '@app/socket-io/instance',
  });

  static readonly SERVER_OPTIONS = BindingKeys.build<Partial<IServerOptions>>({
    key: '@app/socket-io/server-options',
  });

  static readonly REDIS_CONNECTION = BindingKeys.build<IRedisHelper | null>({
    key: '@app/socket-io/redis-connection',
  });

  static readonly AUTHENTICATE_HANDLER = BindingKeys.build<TSocketIOAuthenticateFn | null>({
    key: '@app/socket-io/authenticate-handler',
  });

  static readonly VALIDATE_ROOM_HANDLER = BindingKeys.build<TSocketIOValidateRoomFn | null>({
    key: '@app/socket-io/validate-room-handler',
  });

  static readonly CLIENT_CONNECTED_HANDLER = BindingKeys.build<TSocketIOClientConnectedFn | null>({
    key: '@app/socket-io/client-connected-handler',
  });
}
