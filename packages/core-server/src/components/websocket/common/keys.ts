export class WebSocketBindingKeys {
  static readonly WEBSOCKET_INSTANCE = '@app/websocket/instance';

  static readonly SERVER_OPTIONS = '@app/websocket/server-options';
  static readonly REDIS_CONNECTION = '@app/websocket/redis-connection';

  static readonly AUTHENTICATE_HANDLER = '@app/websocket/authenticate-handler';
  static readonly VALIDATE_ROOM_HANDLER = '@app/websocket/validate-room-handler';
  static readonly CLIENT_CONNECTED_HANDLER = '@app/websocket/client-connected-handler';
  static readonly CLIENT_DISCONNECTED_HANDLER = '@app/websocket/client-disconnected-handler';
  static readonly MESSAGE_HANDLER = '@app/websocket/message-handler';
  static readonly OUTBOUND_TRANSFORMER = '@app/websocket/outbound-transformer';
  static readonly HANDSHAKE_HANDLER = '@app/websocket/handshake-handler';
}
