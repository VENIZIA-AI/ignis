import { BindingKeys } from '@venizia/ignis-inversion';
import type {
  IRedisHelper,
  TWebSocketAuthenticateFn,
  TWebSocketClientConnectedFn,
  TWebSocketClientDisconnectedFn,
  TWebSocketHandshakeFn,
  TWebSocketMessageHandler,
  TWebSocketOutboundTransformer,
  TWebSocketValidateRoomFn,
  WebSocketServerHelper,
} from '@venizia/ignis-helpers';
import type { z } from '@hono/zod-openapi';
import type { IServerOptions } from './types';

/** Container keys of the WebSocket component: the server instance, its options, the Redis connection and the handlers an application binds. */
export class WebSocketBindingKeys {
  static readonly WEBSOCKET_INSTANCE = BindingKeys.build<WebSocketServerHelper>({
    key: '@app/websocket/instance',
  });

  static readonly SERVER_OPTIONS = BindingKeys.build<Partial<IServerOptions>>({
    key: '@app/websocket/server-options',
  });

  static readonly REDIS_CONNECTION = BindingKeys.build<IRedisHelper | null>({
    key: '@app/websocket/redis-connection',
  });

  /** Checks the authentication data before `AUTHENTICATE_HANDLER` and `HANDSHAKE_HANDLER` receive it. Optional. */
  static readonly AUTH_SCHEMA = BindingKeys.build<z.ZodType<Record<string, unknown>> | null>({
    key: '@app/websocket/auth-schema',
  });

  static readonly AUTHENTICATE_HANDLER = BindingKeys.build<TWebSocketAuthenticateFn | null>({
    key: '@app/websocket/authenticate-handler',
  });

  static readonly VALIDATE_ROOM_HANDLER = BindingKeys.build<TWebSocketValidateRoomFn | null>({
    key: '@app/websocket/validate-room-handler',
  });

  static readonly CLIENT_CONNECTED_HANDLER = BindingKeys.build<TWebSocketClientConnectedFn | null>({
    key: '@app/websocket/client-connected-handler',
  });

  static readonly CLIENT_DISCONNECTED_HANDLER =
    BindingKeys.build<TWebSocketClientDisconnectedFn | null>({
      key: '@app/websocket/client-disconnected-handler',
    });

  static readonly MESSAGE_HANDLER = BindingKeys.build<TWebSocketMessageHandler | null>({
    key: '@app/websocket/message-handler',
  });

  static readonly OUTBOUND_TRANSFORMER = BindingKeys.build<TWebSocketOutboundTransformer | null>({
    key: '@app/websocket/outbound-transformer',
  });

  static readonly HANDSHAKE_HANDLER = BindingKeys.build<TWebSocketHandshakeFn | null>({
    key: '@app/websocket/handshake-handler',
  });
}
