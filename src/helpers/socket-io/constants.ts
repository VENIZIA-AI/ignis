export class SocketIOConstants {
  static readonly EVENT_PING = 'ping';
  static readonly EVENT_CONNECT = 'connection';
  static readonly EVENT_DISCONNECT = 'disconnect';
  static readonly EVENT_JOIN = 'join';
  static readonly EVENT_LEAVE = 'leave';
  static readonly EVENT_AUTHENTICATE = 'authenticate';
  static readonly EVENT_AUTHENTICATED = 'authenticated';
  static readonly EVENT_UNAUTHENTICATE = 'unauthenticated';

  static readonly ROOM_DEFAULT = 'io-default';
  static readonly ROOM_NOTIFICATION = 'io-notification';
}
