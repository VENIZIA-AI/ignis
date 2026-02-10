import { TConstValue } from '@/common/types';

// -------------------------------------------------------------------------------------------------------------
// System Events
// -------------------------------------------------------------------------------------------------------------
export class WebSocketEvents {
  static readonly AUTHENTICATE = 'authenticate';
  static readonly CONNECTED = 'connected';
  static readonly DISCONNECT = 'disconnect';
  static readonly JOIN = 'join';
  static readonly LEAVE = 'leave';
  static readonly ERROR = 'error';
  static readonly HEARTBEAT = 'heartbeat';

  static readonly SCHEME_SET = new Set([
    this.AUTHENTICATE,
    this.CONNECTED,
    this.DISCONNECT,
    this.JOIN,
    this.LEAVE,
    this.ERROR,
    this.HEARTBEAT,
  ]);

  static isValid(input: string): input is TWebSocketEvent {
    return this.SCHEME_SET.has(input);
  }
}
export type TWebSocketEvent = TConstValue<typeof WebSocketEvents>;

// -------------------------------------------------------------------------------------------------------------
// Redis Channel Prefixes
// -------------------------------------------------------------------------------------------------------------
export class WebSocketChannels {
  static readonly BROADCAST = 'ws:broadcast';
  static readonly ROOM_PREFIX = 'ws:room:';
  static readonly CLIENT_PREFIX = 'ws:client:';
  static readonly USER_PREFIX = 'ws:user:';

  // --- Channel builders ---
  static forRoom(opts: { room: string }): string {
    return `${this.ROOM_PREFIX}${opts.room}`;
  }

  static forClient(opts: { clientId: string }): string {
    return `${this.CLIENT_PREFIX}${opts.clientId}`;
  }

  static forUser(opts: { userId: string }): string {
    return `${this.USER_PREFIX}${opts.userId}`;
  }

  // --- Pattern builders (for psubscribe) ---
  static forRoomPattern(): string {
    return `${this.ROOM_PREFIX}*`;
  }

  static forClientPattern(): string {
    return `${this.CLIENT_PREFIX}*`;
  }

  static forUserPattern(): string {
    return `${this.USER_PREFIX}*`;
  }
}

// -------------------------------------------------------------------------------------------------------------
// Defaults
// -------------------------------------------------------------------------------------------------------------
export class WebSocketDefaults {
  static readonly PATH = '/ws';

  static readonly ROOM = 'ws-default';
  static readonly NOTIFICATION_ROOM = 'ws-notification';
  static readonly BROADCAST_TOPIC = 'ws:internal:broadcast';

  static readonly MAX_PAYLOAD_LENGTH = 128 * 1024; // 128KB
  static readonly IDLE_TIMEOUT = 60; // seconds
  static readonly BACKPRESSURE_LIMIT = 1024 * 1024; // 1MB (Bun default)
  static readonly SEND_PINGS = true;
  static readonly PUBLISH_TO_SELF = false;
  static readonly AUTH_TIMEOUT = 5_000; // 5 seconds to authenticate or get disconnected
  static readonly HEARTBEAT_INTERVAL = 30_000; // 30s between heartbeats
  static readonly HEARTBEAT_TIMEOUT = 90_000; // 3x interval — disconnect after 3 missed heartbeats
}

// -------------------------------------------------------------------------------------------------------------
// Message Types
// -------------------------------------------------------------------------------------------------------------
export class WebSocketMessageTypes {
  static readonly CLIENT = 'client';
  static readonly USER = 'user';
  static readonly ROOM = 'room';
  static readonly BROADCAST = 'broadcast';

  static readonly SCHEME_SET = new Set([this.CLIENT, this.USER, this.ROOM, this.BROADCAST]);

  static isValid(input: string): input is TWebSocketMessageType {
    return this.SCHEME_SET.has(input);
  }
}
export type TWebSocketMessageType = TConstValue<typeof WebSocketMessageTypes>;

// -------------------------------------------------------------------------------------------------------------
// Client States
// -------------------------------------------------------------------------------------------------------------
export class WebSocketClientStates {
  static readonly UNAUTHORIZED = 'unauthorized';
  static readonly AUTHENTICATING = 'authenticating';
  static readonly AUTHENTICATED = 'authenticated';
  static readonly DISCONNECTED = 'disconnected';

  static readonly SCHEME_SET = new Set([
    this.UNAUTHORIZED,
    this.AUTHENTICATING,
    this.AUTHENTICATED,
    this.DISCONNECTED,
  ]);

  static isValid(input: string): input is TConstValue<typeof WebSocketClientStates> {
    return this.SCHEME_SET.has(input);
  }
}
