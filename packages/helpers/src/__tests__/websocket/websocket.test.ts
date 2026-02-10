/**
 * WebSocket Helpers Test Suite
 *
 * Tests for WebSocketEvents, WebSocketChannels, WebSocketDefaults, WebSocketMessageTypes,
 * WebSocketClientStates, WebSocketServerHelper, and WebSocketEmitter.
 *
 * All tests use mocked Redis and Bun server instances since the helpers
 * require Redis pub/sub and Bun native WebSocket functionality.
 *
 * Test Categories:
 * 1. WebSocketEvents - System event constants
 * 2. WebSocketChannels - Redis channel prefixes
 * 3. WebSocketDefaults - Default configuration values
 * 4. WebSocketMessageTypes - Message type constants
 * 5. WebSocketClientStates - State validation
 * 6. WebSocketServerHelper - Constructor, lifecycle, messaging, rooms, Redis, auth, shutdown,
 *    backpressure, broadcast topic, drain, Bun config passthrough
 * 7. WebSocketEmitter - Constructor, emit methods, shutdown
 *
 * @module __tests__/websocket
 */

import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import { EventEmitter } from 'node:events';
import {
  WebSocketEvents,
  WebSocketChannels,
  WebSocketDefaults,
  WebSocketMessageTypes,
  WebSocketClientStates,
  WebSocketServerHelper,
  WebSocketEmitter,
} from '@/helpers/socket/websocket';
import type { IWebSocketServerOptions, IRedisSocketMessage } from '@/helpers/socket/websocket';
import { DefaultRedisHelper } from '@/helpers/redis';

// =============================================================================
// Test Utilities
// =============================================================================

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Connect a client and authenticate via post-connection auth pattern.
 * Default authenticateFn mock returns { userId } from the auth data payload.
 */
async function connectAndAuth(
  h: WebSocketServerHelper,
  opts: {
    clientId: string;
    socket: ReturnType<typeof createMockSocket>;
    userId?: string;
    metadata?: Record<string, unknown>;
  },
) {
  h.onClientConnect({ clientId: opts.clientId, socket: opts.socket });
  h.onClientMessage({
    clientId: opts.clientId,
    raw: JSON.stringify({
      event: WebSocketEvents.AUTHENTICATE,
      data: {
        ...(opts.userId !== undefined ? { userId: opts.userId } : {}),
        ...(opts.metadata ? { metadata: opts.metadata } : {}),
      },
    }),
  });
  await wait(10);
}

// =============================================================================
// Mock Factories
// =============================================================================

class MockRedisClient extends EventEmitter {
  status: string = 'ready';
  private subscriptions: Set<string> = new Set();
  private psubscriptions: Set<string> = new Set();

  publishedMessages: Array<{ channel: string; message: string }> = [];

  connect = mock(() => {
    this.status = 'ready';
    this.emit('ready');
  });

  duplicate = mock(() => {
    const dup = new MockRedisClient();
    dup.status = this.status;
    return dup;
  });

  subscribe = mock((channel: string) => {
    this.subscriptions.add(channel);
  });

  psubscribe = mock((pattern: string) => {
    this.psubscriptions.add(pattern);
  });

  publish = mock((channel: string, message: string) => {
    this.publishedMessages.push({ channel, message });
    return Promise.resolve(1);
  });

  quit = mock(() => Promise.resolve());

  getSubscriptions() {
    return this.subscriptions;
  }

  getPSubscriptions() {
    return this.psubscriptions;
  }
}

function createMockRedisHelper(): DefaultRedisHelper & { mockClient: MockRedisClient } {
  const mockClient = new MockRedisClient();
  const helper = {
    getClient: () => mockClient,
    mockClient,
  } as unknown as DefaultRedisHelper & { mockClient: MockRedisClient };
  return helper;
}

function createMockSocket(clientId: string) {
  return {
    data: {
      clientId,
      userId: undefined as string | undefined,
      metadata: undefined as Record<string, unknown> | undefined,
    },
    send: mock(() => 1), // 1 = success (Bun convention)
    close: mock(() => {}),
    subscribe: mock(() => {}),
    unsubscribe: mock(() => {}),
    isSubscribed: mock(() => false),
    cork: mock((cb: Function) => cb()),
    remoteAddress: '127.0.0.1',
    readyState: 1,
  };
}

function createMockBunServer() {
  return {
    publish: mock(() => 0),
    pendingWebSockets: 0,
  };
}

// =============================================================================
// WebSocketEvents Tests
// =============================================================================

describe('WebSocketEvents', () => {
  test('should have correct event constants (consistent with Socket.IO naming)', () => {
    expect(WebSocketEvents.AUTHENTICATE).toBe('authenticate');
    expect(WebSocketEvents.CONNECTED).toBe('connected');
    expect(WebSocketEvents.DISCONNECT).toBe('disconnect');
    expect(WebSocketEvents.JOIN).toBe('join');
    expect(WebSocketEvents.LEAVE).toBe('leave');
    expect(WebSocketEvents.ERROR).toBe('error');
  });

  test('system events should be plain string names (no prefix)', () => {
    const events = [
      WebSocketEvents.AUTHENTICATE,
      WebSocketEvents.CONNECTED,
      WebSocketEvents.DISCONNECT,
      WebSocketEvents.JOIN,
      WebSocketEvents.LEAVE,
      WebSocketEvents.ERROR,
    ];

    for (const event of events) {
      expect(event).not.toContain('__');
    }
  });

  test('should have HEARTBEAT event constant', () => {
    expect(WebSocketEvents.HEARTBEAT).toBe('heartbeat');
  });

  test('should have a SCHEME_SET with all 7 events', () => {
    expect(WebSocketEvents.SCHEME_SET).toBeInstanceOf(Set);
    expect(WebSocketEvents.SCHEME_SET.size).toBe(7);
    expect(WebSocketEvents.SCHEME_SET.has('authenticate')).toBe(true);
    expect(WebSocketEvents.SCHEME_SET.has('connected')).toBe(true);
    expect(WebSocketEvents.SCHEME_SET.has('disconnect')).toBe(true);
    expect(WebSocketEvents.SCHEME_SET.has('join')).toBe(true);
    expect(WebSocketEvents.SCHEME_SET.has('leave')).toBe(true);
    expect(WebSocketEvents.SCHEME_SET.has('error')).toBe(true);
    expect(WebSocketEvents.SCHEME_SET.has('heartbeat')).toBe(true);
  });

  describe('isValid()', () => {
    test('should accept all valid events', () => {
      expect(WebSocketEvents.isValid('authenticate')).toBe(true);
      expect(WebSocketEvents.isValid('connected')).toBe(true);
      expect(WebSocketEvents.isValid('disconnect')).toBe(true);
      expect(WebSocketEvents.isValid('join')).toBe(true);
      expect(WebSocketEvents.isValid('leave')).toBe(true);
      expect(WebSocketEvents.isValid('error')).toBe(true);
      expect(WebSocketEvents.isValid('heartbeat')).toBe(true);
    });

    test('should reject invalid events', () => {
      expect(WebSocketEvents.isValid('invalid')).toBe(false);
      expect(WebSocketEvents.isValid('')).toBe(false);
      expect(WebSocketEvents.isValid('ping')).toBe(false);
      expect(WebSocketEvents.isValid('custom-event')).toBe(false);
    });
  });
});

// =============================================================================
// WebSocketChannels Tests
// =============================================================================

describe('WebSocketChannels', () => {
  test('should have correct channel constants', () => {
    expect(WebSocketChannels.BROADCAST).toBe('ws:broadcast');
    expect(WebSocketChannels.ROOM_PREFIX).toBe('ws:room:');
    expect(WebSocketChannels.CLIENT_PREFIX).toBe('ws:client:');
    expect(WebSocketChannels.USER_PREFIX).toBe('ws:user:');
  });

  test('channel prefixes should end with colon (except broadcast)', () => {
    expect(WebSocketChannels.ROOM_PREFIX.endsWith(':')).toBe(true);
    expect(WebSocketChannels.CLIENT_PREFIX.endsWith(':')).toBe(true);
    expect(WebSocketChannels.USER_PREFIX.endsWith(':')).toBe(true);
  });

  test('broadcast channel should not end with colon', () => {
    expect(WebSocketChannels.BROADCAST.endsWith(':')).toBe(false);
  });

  describe('Channel builders', () => {
    test('forClient() should build client channel', () => {
      expect(WebSocketChannels.forClient({ clientId: 'c1' })).toBe('ws:client:c1');
    });

    test('forUser() should build user channel', () => {
      expect(WebSocketChannels.forUser({ userId: 'u1' })).toBe('ws:user:u1');
    });

    test('forRoom() should build room channel', () => {
      expect(WebSocketChannels.forRoom({ room: 'lobby' })).toBe('ws:room:lobby');
    });
  });

  describe('Pattern builders', () => {
    test('forClientPattern() should build client wildcard', () => {
      expect(WebSocketChannels.forClientPattern()).toBe('ws:client:*');
    });

    test('forUserPattern() should build user wildcard', () => {
      expect(WebSocketChannels.forUserPattern()).toBe('ws:user:*');
    });

    test('forRoomPattern() should build room wildcard', () => {
      expect(WebSocketChannels.forRoomPattern()).toBe('ws:room:*');
    });
  });
});

// =============================================================================
// WebSocketDefaults Tests
// =============================================================================

describe('WebSocketDefaults', () => {
  test('should have correct default path', () => {
    expect(WebSocketDefaults.PATH).toBe('/ws');
  });

  test('should have correct default rooms', () => {
    expect(WebSocketDefaults.ROOM).toBe('ws-default');
    expect(WebSocketDefaults.NOTIFICATION_ROOM).toBe('ws-notification');
  });

  test('should have correct broadcast topic', () => {
    expect(WebSocketDefaults.BROADCAST_TOPIC).toBe('ws:internal:broadcast');
  });

  test('should have correct default max payload length (128KB)', () => {
    expect(WebSocketDefaults.MAX_PAYLOAD_LENGTH).toBe(128 * 1024);
  });

  test('should have correct default idle timeout (60 seconds)', () => {
    expect(WebSocketDefaults.IDLE_TIMEOUT).toBe(60);
  });

  test('should have correct default backpressure limit (1MB)', () => {
    expect(WebSocketDefaults.BACKPRESSURE_LIMIT).toBe(1024 * 1024);
  });

  test('should have correct default sendPings (true)', () => {
    expect(WebSocketDefaults.SEND_PINGS).toBe(true);
  });

  test('should have correct default publishToSelf (false)', () => {
    expect(WebSocketDefaults.PUBLISH_TO_SELF).toBe(false);
  });

  test('should have correct default auth timeout (5 seconds)', () => {
    expect(WebSocketDefaults.AUTH_TIMEOUT).toBe(5_000);
  });

  test('should have correct default heartbeat interval (30 seconds)', () => {
    expect(WebSocketDefaults.HEARTBEAT_INTERVAL).toBe(30_000);
  });

  test('should have correct default heartbeat timeout (90 seconds)', () => {
    expect(WebSocketDefaults.HEARTBEAT_TIMEOUT).toBe(90_000);
  });
});

// =============================================================================
// WebSocketMessageTypes Tests
// =============================================================================

describe('WebSocketMessageTypes', () => {
  test('should have correct message type constants', () => {
    expect(WebSocketMessageTypes.CLIENT).toBe('client');
    expect(WebSocketMessageTypes.USER).toBe('user');
    expect(WebSocketMessageTypes.ROOM).toBe('room');
    expect(WebSocketMessageTypes.BROADCAST).toBe('broadcast');
  });

  test('should have a SCHEME_SET with all 4 types', () => {
    expect(WebSocketMessageTypes.SCHEME_SET).toBeInstanceOf(Set);
    expect(WebSocketMessageTypes.SCHEME_SET.size).toBe(4);
    expect(WebSocketMessageTypes.SCHEME_SET.has('client')).toBe(true);
    expect(WebSocketMessageTypes.SCHEME_SET.has('user')).toBe(true);
    expect(WebSocketMessageTypes.SCHEME_SET.has('room')).toBe(true);
    expect(WebSocketMessageTypes.SCHEME_SET.has('broadcast')).toBe(true);
  });

  describe('isValid()', () => {
    test('should accept all valid message types', () => {
      expect(WebSocketMessageTypes.isValid('client')).toBe(true);
      expect(WebSocketMessageTypes.isValid('user')).toBe(true);
      expect(WebSocketMessageTypes.isValid('room')).toBe(true);
      expect(WebSocketMessageTypes.isValid('broadcast')).toBe(true);
    });

    test('should reject invalid message types', () => {
      expect(WebSocketMessageTypes.isValid('invalid')).toBe(false);
      expect(WebSocketMessageTypes.isValid('')).toBe(false);
      expect(WebSocketMessageTypes.isValid('CLIENT')).toBe(false);
      expect(WebSocketMessageTypes.isValid('server')).toBe(false);
    });
  });
});

// =============================================================================
// WebSocketClientStates Tests
// =============================================================================

describe('WebSocketClientStates', () => {
  test('should have correct state values (consistent with Socket.IO)', () => {
    expect(WebSocketClientStates.UNAUTHORIZED).toBe('unauthorized');
    expect(WebSocketClientStates.AUTHENTICATING).toBe('authenticating');
    expect(WebSocketClientStates.AUTHENTICATED).toBe('authenticated');
    expect(WebSocketClientStates.DISCONNECTED).toBe('disconnected');
  });

  test('should have a SCHEME_SET with all 4 states', () => {
    expect(WebSocketClientStates.SCHEME_SET).toBeInstanceOf(Set);
    expect(WebSocketClientStates.SCHEME_SET.size).toBe(4);
    expect(WebSocketClientStates.SCHEME_SET.has('unauthorized')).toBe(true);
    expect(WebSocketClientStates.SCHEME_SET.has('authenticating')).toBe(true);
    expect(WebSocketClientStates.SCHEME_SET.has('authenticated')).toBe(true);
    expect(WebSocketClientStates.SCHEME_SET.has('disconnected')).toBe(true);
  });

  describe('isValid()', () => {
    test('should accept all valid states', () => {
      expect(WebSocketClientStates.isValid('unauthorized')).toBe(true);
      expect(WebSocketClientStates.isValid('authenticating')).toBe(true);
      expect(WebSocketClientStates.isValid('authenticated')).toBe(true);
      expect(WebSocketClientStates.isValid('disconnected')).toBe(true);
    });

    test('should reject invalid states', () => {
      expect(WebSocketClientStates.isValid('invalid')).toBe(false);
      expect(WebSocketClientStates.isValid('')).toBe(false);
      expect(WebSocketClientStates.isValid('CONNECTED')).toBe(false);
      expect(WebSocketClientStates.isValid('DISCONNECTED')).toBe(false);
      expect(WebSocketClientStates.isValid('UNAUTHORIZED')).toBe(false);
    });

    test('should reject states not in the set', () => {
      expect(WebSocketClientStates.isValid('pending')).toBe(false);
      expect(WebSocketClientStates.isValid('active')).toBe(false);
      expect(WebSocketClientStates.isValid('closed')).toBe(false);
    });
  });
});

// =============================================================================
// WebSocketServerHelper Tests
// =============================================================================

describe('WebSocketServerHelper', () => {
  let helper: WebSocketServerHelper;
  let opts: IWebSocketServerOptions;
  let mockBunServer: ReturnType<typeof createMockBunServer>;
  let mockRedisHelper: DefaultRedisHelper & { mockClient: MockRedisClient };

  beforeEach(() => {
    mockBunServer = createMockBunServer();
    mockRedisHelper = createMockRedisHelper();

    opts = {
      identifier: 'test-ws-server',
      server: mockBunServer,
      redisConnection: mockRedisHelper,
      authenticateFn: mock((data: Record<string, unknown>) => ({
        userId: (data.userId as string) ?? 'user-1',
        metadata: data.metadata as Record<string, unknown> | undefined,
      })),
    };

    helper = new WebSocketServerHelper(opts);
  });

  afterEach(async () => {
    try {
      await helper.shutdown();
    } catch {
      // Ignore errors during cleanup
    }
  });

  // ---------------------------------------------------------------------------
  // Constructor
  // ---------------------------------------------------------------------------
  describe('Constructor', () => {
    test('should create helper with default options', () => {
      expect(helper).toBeDefined();
      expect(helper.identifier).toBe('test-ws-server');
      expect(helper.getPath()).toBe('/ws');
    });

    test('should use custom path when provided', () => {
      const customHelper = new WebSocketServerHelper({
        ...opts,
        path: '/custom-ws',
      });
      expect(customHelper.getPath()).toBe('/custom-ws');
    });

    test('should initialize with empty clients', () => {
      const clients = helper.getClients() as Map<string, unknown>;
      expect(clients).toBeInstanceOf(Map);
      expect(clients.size).toBe(0);
    });

    test('should throw when redisConnection is null', () => {
      expect(() => {
        new WebSocketServerHelper({
          ...opts,
          redisConnection: null as any,
        });
      }).toThrow('Invalid redis connection');
    });

    test('should duplicate Redis client for pub and sub', () => {
      expect(mockRedisHelper.mockClient.duplicate).toHaveBeenCalledTimes(2);
    });

    test('should use custom defaultRooms when provided', async () => {
      const customHelper = new WebSocketServerHelper({
        ...opts,
        defaultRooms: ['room-a', 'room-b'],
      });

      const socket = createMockSocket('client-1');
      await connectAndAuth(customHelper, { clientId: 'client-1', socket });

      const client = customHelper.getClients({ id: 'client-1' }) as any;
      expect(client.rooms.has('room-a')).toBe(true);
      expect(client.rooms.has('room-b')).toBe(true);
      expect(client.rooms.has(WebSocketDefaults.ROOM)).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Configure
  // ---------------------------------------------------------------------------
  describe('configure()', () => {
    test('should complete when Redis clients are already ready', async () => {
      await helper.configure();
      // If it doesn't throw, it passed
    });

    test('should connect Redis clients in wait status', async () => {
      // Create helper with Redis in 'wait' status
      const waitClient = new MockRedisClient();
      waitClient.status = 'wait';

      const waitRedisHelper = {
        getClient: () => waitClient,
      } as unknown as DefaultRedisHelper;

      const waitHelper = new WebSocketServerHelper({
        ...opts,
        redisConnection: waitRedisHelper,
      });

      // The duplicated clients should also be in wait
      // connect() is mocked to set status to ready and emit ready
      await waitHelper.configure();
    });

    test('should subscribe to broadcast channel', async () => {
      await helper.configure();

      // Find the redisSub mock — it's the second duplicate
      const allDups = mockRedisHelper.mockClient.duplicate.mock.results;
      const redisSub = allDups[1]?.value as MockRedisClient;

      expect(redisSub.subscribe).toHaveBeenCalledWith(WebSocketChannels.BROADCAST);
    });

    test('should psubscribe to room, client, and user channel patterns', async () => {
      await helper.configure();

      const allDups = mockRedisHelper.mockClient.duplicate.mock.results;
      const redisSub = allDups[1]?.value as MockRedisClient;

      expect(redisSub.psubscribe).toHaveBeenCalledWith(WebSocketChannels.forRoomPattern());
      expect(redisSub.psubscribe).toHaveBeenCalledWith(WebSocketChannels.forClientPattern());
      expect(redisSub.psubscribe).toHaveBeenCalledWith(WebSocketChannels.forUserPattern());
    });
  });

  // ---------------------------------------------------------------------------
  // Post-connection Authentication
  // ---------------------------------------------------------------------------
  describe('Post-connection Authentication', () => {
    test('should authenticate and transition to AUTHENTICATED state', async () => {
      const socket = createMockSocket('client-1');
      helper.onClientConnect({ clientId: 'client-1', socket });

      expect((helper.getClients({ id: 'client-1' }) as any).state).toBe(
        WebSocketClientStates.UNAUTHORIZED,
      );

      helper.onClientMessage({
        clientId: 'client-1',
        raw: JSON.stringify({
          event: WebSocketEvents.AUTHENTICATE,
          data: { userId: 'user-1' },
        }),
      });
      await wait(10);

      const client = helper.getClients({ id: 'client-1' }) as any;
      expect(client.state).toBe(WebSocketClientStates.AUTHENTICATED);
      expect(client.userId).toBe('user-1');
    });

    test('should set metadata on client after auth', async () => {
      const metaHelper = new WebSocketServerHelper({
        ...opts,
        authenticateFn: mock(() => ({
          userId: 'user-1',
          metadata: { role: 'admin', tenant: 'acme' },
        })),
      });

      const socket = createMockSocket('client-1');
      metaHelper.onClientConnect({ clientId: 'client-1', socket });
      metaHelper.onClientMessage({
        clientId: 'client-1',
        raw: JSON.stringify({ event: WebSocketEvents.AUTHENTICATE, data: {} }),
      });
      await wait(10);

      const client = metaHelper.getClients({ id: 'client-1' }) as any;
      expect(client.metadata).toEqual({ role: 'admin', tenant: 'acme' });
    });

    test('should index client by userId after auth', async () => {
      const socket = createMockSocket('client-1');
      await connectAndAuth(helper, { clientId: 'client-1', socket, userId: 'user-1' });

      const userClients = helper.getClientsByUser({ userId: 'user-1' });
      expect(userClients).toHaveLength(1);
      expect(userClients[0].id).toBe('client-1');
    });

    test('should subscribe to broadcast topic after auth', async () => {
      const socket = createMockSocket('client-1');
      await connectAndAuth(helper, { clientId: 'client-1', socket });

      expect(socket.subscribe).toHaveBeenCalledWith(WebSocketDefaults.BROADCAST_TOPIC);
    });

    test('should join default rooms after auth', async () => {
      const socket = createMockSocket('client-1');
      await connectAndAuth(helper, { clientId: 'client-1', socket });

      const client = helper.getClients({ id: 'client-1' }) as any;
      expect(client.rooms.has(WebSocketDefaults.ROOM)).toBe(true);
      expect(client.rooms.has(WebSocketDefaults.NOTIFICATION_ROOM)).toBe(true);
    });

    test('should subscribe socket to broadcast topic, client ID room, and default rooms after auth', async () => {
      const socket = createMockSocket('client-1');
      await connectAndAuth(helper, { clientId: 'client-1', socket });

      expect(socket.subscribe).toHaveBeenCalledWith('client-1');
      expect(socket.subscribe).toHaveBeenCalledWith(WebSocketDefaults.BROADCAST_TOPIC);
      expect(socket.subscribe).toHaveBeenCalledWith(WebSocketDefaults.ROOM);
      expect(socket.subscribe).toHaveBeenCalledWith(WebSocketDefaults.NOTIFICATION_ROOM);
    });

    test('should send CONNECTED event after auth', async () => {
      const socket = createMockSocket('client-1');
      await connectAndAuth(helper, { clientId: 'client-1', socket });

      const calls = socket.send.mock.calls as any[][];
      const connectedMsg = calls.find(call => {
        const parsed = JSON.parse(call[0]);
        return parsed.event === WebSocketEvents.CONNECTED;
      });
      expect(connectedMsg).toBeDefined();
      const payload = JSON.parse(connectedMsg![0]);
      expect(payload.data.id).toBe('client-1');
      expect(payload.data.time).toBeDefined();
    });

    test('should invoke clientConnectedFn after auth', async () => {
      const connectedFn = mock(() => {});
      const callbackHelper = new WebSocketServerHelper({
        ...opts,
        clientConnectedFn: connectedFn,
      });

      const socket = createMockSocket('client-1');
      await connectAndAuth(callbackHelper, { clientId: 'client-1', socket, userId: 'user-1' });

      expect(connectedFn).toHaveBeenCalledWith({
        clientId: 'client-1',
        userId: 'user-1',
        metadata: undefined,
      });
    });

    test('should handle clientConnectedFn that rejects', async () => {
      const rejectingFn = mock(async () => {
        throw new Error('callback error');
      });
      const callbackHelper = new WebSocketServerHelper({
        ...opts,
        clientConnectedFn: rejectingFn,
      });

      const socket = createMockSocket('client-1');
      await connectAndAuth(callbackHelper, { clientId: 'client-1', socket });

      // Client should still be registered despite callback rejection
      const client = callbackHelper.getClients({ id: 'client-1' }) as any;
      expect(client).toBeDefined();
      expect(client.state).toBe(WebSocketClientStates.AUTHENTICATED);
    });

    test('should reject auth when authenticateFn returns null', async () => {
      const rejectHelper = new WebSocketServerHelper({
        ...opts,
        authenticateFn: mock(() => null),
      });

      const socket = createMockSocket('client-1');
      rejectHelper.onClientConnect({ clientId: 'client-1', socket });
      rejectHelper.onClientMessage({
        clientId: 'client-1',
        raw: JSON.stringify({ event: WebSocketEvents.AUTHENTICATE, data: {} }),
      });
      await wait(10);

      expect(socket.close).toHaveBeenCalledWith(4003, 'Authentication failed');
    });

    test('should reject auth when authenticateFn returns false', async () => {
      const rejectHelper = new WebSocketServerHelper({
        ...opts,
        authenticateFn: mock(() => false as const),
      });

      const socket = createMockSocket('client-1');
      rejectHelper.onClientConnect({ clientId: 'client-1', socket });
      rejectHelper.onClientMessage({
        clientId: 'client-1',
        raw: JSON.stringify({ event: WebSocketEvents.AUTHENTICATE, data: {} }),
      });
      await wait(10);

      expect(socket.close).toHaveBeenCalledWith(4003, 'Authentication failed');
    });

    test('should send error event on auth failure before closing', async () => {
      const rejectHelper = new WebSocketServerHelper({
        ...opts,
        authenticateFn: mock(() => null),
      });

      const socket = createMockSocket('client-1');
      rejectHelper.onClientConnect({ clientId: 'client-1', socket });
      rejectHelper.onClientMessage({
        clientId: 'client-1',
        raw: JSON.stringify({ event: WebSocketEvents.AUTHENTICATE, data: {} }),
      });
      await wait(10);

      const calls = socket.send.mock.calls as any[][];
      const errorMsg = calls.find(call => {
        const parsed = JSON.parse(call[0]);
        return parsed.event === WebSocketEvents.ERROR;
      });
      expect(errorMsg).toBeDefined();
      expect(JSON.parse(errorMsg![0]).data.message).toBe('Authentication failed');
    });

    test('should reject auth when authenticateFn throws', async () => {
      const throwHelper = new WebSocketServerHelper({
        ...opts,
        authenticateFn: mock(() => {
          throw new Error('Auth failed');
        }),
      });

      const socket = createMockSocket('client-1');
      throwHelper.onClientConnect({ clientId: 'client-1', socket });
      throwHelper.onClientMessage({
        clientId: 'client-1',
        raw: JSON.stringify({ event: WebSocketEvents.AUTHENTICATE, data: {} }),
      });
      await wait(10);

      expect(socket.close).toHaveBeenCalledWith(4003, 'Authentication failed');
    });

    test('should handle async authenticateFn', async () => {
      const asyncHelper = new WebSocketServerHelper({
        ...opts,
        authenticateFn: mock(async () => {
          await wait(10);
          return { userId: 'async-user', metadata: { role: 'admin' } };
        }),
      });

      const socket = createMockSocket('client-1');
      asyncHelper.onClientConnect({ clientId: 'client-1', socket });
      asyncHelper.onClientMessage({
        clientId: 'client-1',
        raw: JSON.stringify({ event: WebSocketEvents.AUTHENTICATE, data: {} }),
      });
      await wait(50);

      const client = asyncHelper.getClients({ id: 'client-1' }) as any;
      expect(client.state).toBe(WebSocketClientStates.AUTHENTICATED);
      expect(client.userId).toBe('async-user');
      expect(client.metadata).toEqual({ role: 'admin' });
    });

    test('should pass auth data to authenticateFn', async () => {
      const authFn = mock(() => ({ userId: 'user-x' }));
      const authHelper = new WebSocketServerHelper({
        ...opts,
        authenticateFn: authFn,
      });

      const socket = createMockSocket('client-1');
      authHelper.onClientConnect({ clientId: 'client-1', socket });
      authHelper.onClientMessage({
        clientId: 'client-1',
        raw: JSON.stringify({
          event: WebSocketEvents.AUTHENTICATE,
          data: { token: 'my-token', extra: 'data' },
        }),
      });
      await wait(10);

      expect(authFn).toHaveBeenCalledWith({ token: 'my-token', extra: 'data' });
    });

    test('should reject re-authentication (already authenticated)', async () => {
      const socket = createMockSocket('client-1');
      await connectAndAuth(helper, { clientId: 'client-1', socket });

      socket.send.mockClear();
      helper.onClientMessage({
        clientId: 'client-1',
        raw: JSON.stringify({ event: WebSocketEvents.AUTHENTICATE, data: {} }),
      });
      await wait(10);

      const calls = socket.send.mock.calls as any[][];
      const errorMsg = calls.find(call => {
        const parsed = JSON.parse(call[0]);
        return parsed.event === WebSocketEvents.ERROR;
      });
      expect(errorMsg).toBeDefined();
      expect(JSON.parse(errorMsg![0]).data.message).toBe('Already authenticated');
    });

    test('should block non-auth events for unauthenticated clients', () => {
      const socket = createMockSocket('client-1');
      helper.onClientConnect({ clientId: 'client-1', socket });

      socket.send.mockClear();
      helper.onClientMessage({
        clientId: 'client-1',
        raw: JSON.stringify({ event: 'custom-event', data: {} }),
      });

      const calls = socket.send.mock.calls as any[][];
      expect(calls.length).toBe(1);
      const payload = JSON.parse(calls[0][0]);
      expect(payload.event).toBe(WebSocketEvents.ERROR);
      expect(payload.data.message).toBe('Not authenticated');
    });

    test('should index multiple clients by same userId', async () => {
      const socket1 = createMockSocket('client-1');
      const socket2 = createMockSocket('client-2');
      await connectAndAuth(helper, { clientId: 'client-1', socket: socket1, userId: 'user-1' });
      await connectAndAuth(helper, { clientId: 'client-2', socket: socket2, userId: 'user-1' });

      const userClients = helper.getClientsByUser({ userId: 'user-1' });
      expect(userClients).toHaveLength(2);
    });
  });

  // ---------------------------------------------------------------------------
  // Bun WebSocket Handler
  // ---------------------------------------------------------------------------
  describe('getBunWebSocketHandler()', () => {
    test('should return handler object with open, message, close, drain', () => {
      const handler = helper.getBunWebSocketHandler();

      expect(handler.open).toBeFunction();
      expect(handler.message).toBeFunction();
      expect(handler.close).toBeFunction();
      expect(handler.drain).toBeFunction();
    });

    test('open handler should register client via onClientConnect', () => {
      const handler = helper.getBunWebSocketHandler();

      const socket = createMockSocket('c1');
      handler.open(socket);

      // Verify side effect: client was registered with UNAUTHORIZED state
      const client = helper.getClients({ id: 'c1' });
      expect(client).toBeDefined();
      expect((client as { id: string }).id).toBe('c1');
      expect((client as { state: string }).state).toBe(WebSocketClientStates.UNAUTHORIZED);
    });

    test('message handler should route string messages to messageHandler', async () => {
      const messageHandler = mock(() => {});
      const msgHelper = new WebSocketServerHelper({
        ...opts,
        messageHandler,
      });
      const handler = msgHelper.getBunWebSocketHandler();

      // First register and authenticate a client
      const socketObj = createMockSocket('c1');
      await connectAndAuth(msgHelper, { clientId: 'c1', socket: socketObj, userId: 'u1' });

      handler.message(createMockSocket('c1'), '{"event":"test","data":"hello"}');

      expect(messageHandler).toHaveBeenCalledWith({
        clientId: 'c1',
        userId: 'u1',
        message: { event: 'test', data: 'hello' },
      });
    });

    test('message handler should convert Buffer to string', async () => {
      const messageHandler = mock(() => {});
      const msgHelper = new WebSocketServerHelper({
        ...opts,
        messageHandler,
      });
      const handler = msgHelper.getBunWebSocketHandler();

      const socketObj = createMockSocket('c1');
      await connectAndAuth(msgHelper, { clientId: 'c1', socket: socketObj });

      handler.message(createMockSocket('c1'), Buffer.from('{"event":"test","data":"buf"}'));

      expect(messageHandler).toHaveBeenCalledWith({
        clientId: 'c1',
        userId: 'user-1',
        message: { event: 'test', data: 'buf' },
      });
    });

    test('message handler should update lastActivity timestamp', () => {
      const handler = helper.getBunWebSocketHandler();

      const socketObj = createMockSocket('c1');
      helper.onClientConnect({ clientId: 'c1', socket: socketObj });

      const client = helper.getClients({ id: 'c1' }) as any;
      const before = client.lastActivity;

      // Even for unauthenticated clients, lastActivity is updated on any message
      handler.message(createMockSocket('c1'), '{"event":"authenticate","data":{}}');

      expect(client.lastActivity).toBeGreaterThanOrEqual(before);
    });

    test('close handler should remove client', () => {
      const handler = helper.getBunWebSocketHandler();

      // First register a client
      const socketObj = createMockSocket('c1');
      helper.onClientConnect({ clientId: 'c1', socket: socketObj });
      expect(helper.getClients({ id: 'c1' })).toBeDefined();

      handler.close(createMockSocket('c1'), 1000, 'Normal closure');

      expect(helper.getClients({ id: 'c1' })).toBeUndefined();
    });

    test('drain handler should clear backpressure flag', () => {
      const handler = helper.getBunWebSocketHandler();

      // Register a client and mark as backpressured
      const socketObj = createMockSocket('c1');
      helper.onClientConnect({ clientId: 'c1', socket: socketObj });

      const client = helper.getClients({ id: 'c1' }) as any;
      client.backpressured = true;

      handler.drain(createMockSocket('c1'));

      expect(client.backpressured).toBe(false);
    });

    test('drain handler should not throw for unknown client', () => {
      const handler = helper.getBunWebSocketHandler();
      expect(() => handler.drain(createMockSocket('__unknown__'))).not.toThrow();
    });

    test('should pass Bun config options through to handler', () => {
      const configHelper = new WebSocketServerHelper({
        ...opts,
        serverOptions: {
          perMessageDeflate: true,
          maxPayloadLength: 1024,
          idleTimeout: 60,
          backpressureLimit: 512,
          closeOnBackpressureLimit: true,
          sendPings: false,
          publishToSelf: true,
        },
      });

      const handler = configHelper.getBunWebSocketHandler();

      expect(handler.perMessageDeflate).toBe(true);
      expect(handler.maxPayloadLength).toBe(1024);
      expect(handler.idleTimeout).toBe(60);
      expect(handler.backpressureLimit).toBe(512);
      expect(handler.closeOnBackpressureLimit).toBe(true);
      expect(handler.sendPings).toBe(false);
      expect(handler.publishToSelf).toBe(true);
    });

    test('should apply defaults when no serverOptions provided', () => {
      const handler = helper.getBunWebSocketHandler();

      expect(handler.sendPings).toBe(WebSocketDefaults.SEND_PINGS);
      expect(handler.idleTimeout).toBe(WebSocketDefaults.IDLE_TIMEOUT);
      expect(handler.perMessageDeflate).toBeUndefined();
      expect(handler.maxPayloadLength).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Connection Lifecycle
  // ---------------------------------------------------------------------------
  describe('onClientConnect()', () => {
    test('should register a new client with UNAUTHORIZED state', () => {
      const socket = createMockSocket('client-1');
      helper.onClientConnect({ clientId: 'client-1', socket });

      const client = helper.getClients({ id: 'client-1' }) as any;
      expect(client).toBeDefined();
      expect(client.id).toBe('client-1');
      expect(client.state).toBe(WebSocketClientStates.UNAUTHORIZED);
      expect(client.userId).toBeUndefined();
    });

    test('should subscribe socket to client ID room only (pre-auth)', () => {
      const socket = createMockSocket('client-1');
      helper.onClientConnect({ clientId: 'client-1', socket });

      expect(socket.subscribe).toHaveBeenCalledWith('client-1');
      // Broadcast and default rooms are subscribed after auth
      expect(socket.subscribe).toHaveBeenCalledTimes(1);
    });

    test('should set connectedAt and lastActivity timestamps', () => {
      const before = Date.now();
      const socket = createMockSocket('client-1');
      helper.onClientConnect({ clientId: 'client-1', socket });

      const client = helper.getClients({ id: 'client-1' }) as any;
      expect(client.connectedAt).toBeGreaterThanOrEqual(before);
      expect(client.connectedAt).toBeLessThanOrEqual(Date.now());
      expect(client.lastActivity).toBe(client.connectedAt);
    });

    test('should initialize backpressured as false', () => {
      const socket = createMockSocket('client-1');
      helper.onClientConnect({ clientId: 'client-1', socket });

      const client = helper.getClients({ id: 'client-1' }) as any;
      expect(client.backpressured).toBe(false);
    });

    test('should initialize with empty rooms set', () => {
      const socket = createMockSocket('client-1');
      helper.onClientConnect({ clientId: 'client-1', socket });

      const client = helper.getClients({ id: 'client-1' }) as any;
      expect(client.rooms.size).toBe(0);
    });

    test('should not register duplicate client', () => {
      const socket1 = createMockSocket('client-1');
      const socket2 = createMockSocket('client-1');

      helper.onClientConnect({ clientId: 'client-1', socket: socket1 });
      helper.onClientConnect({ clientId: 'client-1', socket: socket2 });

      const clients = helper.getClients() as Map<string, unknown>;
      expect(clients.size).toBe(1);
    });

    test('should handle anonymous client (no userId before auth)', () => {
      const socket = createMockSocket('client-1');
      helper.onClientConnect({ clientId: 'client-1', socket });

      const client = helper.getClients({ id: 'client-1' }) as any;
      expect(client.userId).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // onClientMessage
  // ---------------------------------------------------------------------------
  describe('onClientMessage()', () => {
    beforeEach(async () => {
      const socket = createMockSocket('client-1');
      await connectAndAuth(helper, { clientId: 'client-1', socket, userId: 'user-1' });
    });

    test('should parse valid JSON message', async () => {
      const messageHandler = mock(() => {});
      const msgHelper = new WebSocketServerHelper({
        ...opts,
        messageHandler,
      });
      const socket = createMockSocket('client-1');
      await connectAndAuth(msgHelper, { clientId: 'client-1', socket, userId: 'user-1' });

      msgHelper.onClientMessage({
        clientId: 'client-1',
        raw: JSON.stringify({ event: 'custom-event', data: { hello: 'world' } }),
      });

      expect(messageHandler).toHaveBeenCalledWith({
        clientId: 'client-1',
        userId: 'user-1',
        message: { event: 'custom-event', data: { hello: 'world' } },
      });
    });

    test('should send error on invalid JSON', () => {
      const socket = (helper.getClients({ id: 'client-1' }) as any).socket;
      socket.send.mockClear();

      helper.onClientMessage({ clientId: 'client-1', raw: 'not-json' });

      expect(socket.send).toHaveBeenCalled();
      const calls = socket.send.mock.calls as any[][];
      // Payload is now a plain JSON string
      const errorPayload = JSON.parse(calls[0][0]);
      expect(errorPayload.event).toBe(WebSocketEvents.ERROR);
      expect(errorPayload.data.message).toBe('Invalid message format');
    });

    test('should ignore message with no event name', async () => {
      const messageHandler = mock(() => {});
      const msgHelper = new WebSocketServerHelper({
        ...opts,
        messageHandler,
      });
      const socket = createMockSocket('client-1');
      await connectAndAuth(msgHelper, { clientId: 'client-1', socket });

      msgHelper.onClientMessage({
        clientId: 'client-1',
        raw: JSON.stringify({ data: 'data' }),
      });

      expect(messageHandler).not.toHaveBeenCalled();
    });

    test('should ignore message for unknown client', () => {
      helper.onClientMessage({
        clientId: 'non-existent',
        raw: JSON.stringify({ event: 'test' }),
      });
      // Should not throw
    });

    test('should handle join event with validateRoomFn', async () => {
      const validateFn = mock(({ rooms }: { rooms: string[] }) => rooms);
      const joinHelper = new WebSocketServerHelper({
        ...opts,
        validateRoomFn: validateFn,
      });
      const socket = createMockSocket('client-1');
      await connectAndAuth(joinHelper, { clientId: 'client-1', socket, userId: 'user-1' });

      joinHelper.onClientMessage({
        clientId: 'client-1',
        raw: JSON.stringify({
          event: WebSocketEvents.JOIN,
          data: { rooms: ['room-x', 'room-y'] },
        }),
      });

      await wait(50);

      expect(validateFn).toHaveBeenCalledWith({
        clientId: 'client-1',
        userId: 'user-1',
        rooms: ['room-x', 'room-y'],
      });

      const client = joinHelper.getClients({ id: 'client-1' }) as any;
      expect(client.rooms.has('room-x')).toBe(true);
      expect(client.rooms.has('room-y')).toBe(true);
    });

    test('should reject join when no validateRoomFn configured', () => {
      // helper has no validateRoomFn by default
      helper.onClientMessage({
        clientId: 'client-1',
        raw: JSON.stringify({
          event: WebSocketEvents.JOIN,
          data: { rooms: ['room-x'] },
        }),
      });

      const client = helper.getClients({ id: 'client-1' }) as any;
      expect(client.rooms.has('room-x')).toBe(false);
    });

    test('should handle leave event', () => {
      // First join a room manually
      helper.joinRoom({ clientId: 'client-1', room: 'room-x' });

      const client = helper.getClients({ id: 'client-1' }) as any;
      expect(client.rooms.has('room-x')).toBe(true);

      helper.onClientMessage({
        clientId: 'client-1',
        raw: JSON.stringify({
          event: WebSocketEvents.LEAVE,
          data: { rooms: ['room-x'] },
        }),
      });

      expect(client.rooms.has('room-x')).toBe(false);
    });

    test('should handle join with empty rooms array', () => {
      helper.onClientMessage({
        clientId: 'client-1',
        raw: JSON.stringify({
          event: WebSocketEvents.JOIN,
          data: { rooms: [] },
        }),
      });
      // Should not throw
    });

    test('should handle leave with empty rooms array', () => {
      helper.onClientMessage({
        clientId: 'client-1',
        raw: JSON.stringify({
          event: WebSocketEvents.LEAVE,
          data: { rooms: [] },
        }),
      });
      // Should not throw
    });

    test('should handle messageHandler that rejects', async () => {
      const rejectingHandler = mock(async () => {
        throw new Error('handler error');
      });
      const msgHelper = new WebSocketServerHelper({
        ...opts,
        messageHandler: rejectingHandler,
      });
      const socket = createMockSocket('client-1');
      await connectAndAuth(msgHelper, { clientId: 'client-1', socket });

      // Async rejection is caught by Promise.resolve().catch()
      expect(() => {
        msgHelper.onClientMessage({
          clientId: 'client-1',
          raw: JSON.stringify({ event: 'custom', data: {} }),
        });
      }).not.toThrow();

      await wait(10);
    });
  });

  // ---------------------------------------------------------------------------
  // onClientDisconnect
  // ---------------------------------------------------------------------------
  describe('onClientDisconnect()', () => {
    beforeEach(async () => {
      const socket = createMockSocket('client-1');
      await connectAndAuth(helper, { clientId: 'client-1', socket, userId: 'user-1' });
    });

    test('should remove client from clients map', () => {
      helper.onClientDisconnect({ clientId: 'client-1' });

      const client = helper.getClients({ id: 'client-1' });
      expect(client).toBeUndefined();
    });

    test('should remove client from user index', () => {
      helper.onClientDisconnect({ clientId: 'client-1' });

      const userClients = helper.getClientsByUser({ userId: 'user-1' });
      expect(userClients).toHaveLength(0);
    });

    test('should remove client from room index', () => {
      helper.onClientDisconnect({ clientId: 'client-1' });

      const roomClients = helper.getClientsByRoom({ room: WebSocketDefaults.ROOM });
      expect(roomClients).toHaveLength(0);
    });

    test('should invoke clientDisconnectedFn callback', async () => {
      const disconnectedFn = mock(() => {});
      const callbackHelper = new WebSocketServerHelper({
        ...opts,
        clientDisconnectedFn: disconnectedFn,
      });
      const socket = createMockSocket('client-1');
      await connectAndAuth(callbackHelper, { clientId: 'client-1', socket, userId: 'user-1' });

      callbackHelper.onClientDisconnect({ clientId: 'client-1' });

      await wait(10);
      expect(disconnectedFn).toHaveBeenCalledWith({
        clientId: 'client-1',
        userId: 'user-1',
      });
    });

    test('should handle disconnect for non-existent client', () => {
      expect(() => {
        helper.onClientDisconnect({ clientId: 'non-existent' });
      }).not.toThrow();
    });

    test('should clean up user index entry when last client disconnects', () => {
      helper.onClientDisconnect({ clientId: 'client-1' });

      const userClients = helper.getClientsByUser({ userId: 'user-1' });
      expect(userClients).toHaveLength(0);
    });

    test('should preserve other clients of same user', async () => {
      const socket2 = createMockSocket('client-2');
      await connectAndAuth(helper, { clientId: 'client-2', socket: socket2, userId: 'user-1' });

      helper.onClientDisconnect({ clientId: 'client-1' });

      const userClients = helper.getClientsByUser({ userId: 'user-1' });
      expect(userClients).toHaveLength(1);
      expect(userClients[0].id).toBe('client-2');
    });

    test('should clean up room index entry when last client leaves', () => {
      helper.onClientDisconnect({ clientId: 'client-1' });

      const roomClients = helper.getClientsByRoom({ room: WebSocketDefaults.ROOM });
      expect(roomClients).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Room Management
  // ---------------------------------------------------------------------------
  describe('Room Management', () => {
    beforeEach(async () => {
      const socket = createMockSocket('client-1');
      await connectAndAuth(helper, { clientId: 'client-1', socket, userId: 'user-1' });
    });

    test('should join a room', () => {
      helper.joinRoom({ clientId: 'client-1', room: 'custom-room' });

      const client = helper.getClients({ id: 'client-1' }) as any;
      expect(client.rooms.has('custom-room')).toBe(true);
    });

    test('should subscribe socket to room (Bun native)', () => {
      const client = helper.getClients({ id: 'client-1' }) as any;
      client.socket.subscribe.mockClear();

      helper.joinRoom({ clientId: 'client-1', room: 'custom-room' });

      expect(client.socket.subscribe).toHaveBeenCalledWith('custom-room');
    });

    test('should track room in roomIndex', () => {
      helper.joinRoom({ clientId: 'client-1', room: 'custom-room' });

      const roomClients = helper.getClientsByRoom({ room: 'custom-room' });
      expect(roomClients).toHaveLength(1);
      expect(roomClients[0].id).toBe('client-1');
    });

    test('should leave a room', () => {
      helper.joinRoom({ clientId: 'client-1', room: 'custom-room' });
      helper.leaveRoom({ clientId: 'client-1', room: 'custom-room' });

      const client = helper.getClients({ id: 'client-1' }) as any;
      expect(client.rooms.has('custom-room')).toBe(false);
    });

    test('should unsubscribe socket from room (Bun native)', () => {
      const client = helper.getClients({ id: 'client-1' }) as any;

      helper.joinRoom({ clientId: 'client-1', room: 'custom-room' });
      helper.leaveRoom({ clientId: 'client-1', room: 'custom-room' });

      expect(client.socket.unsubscribe).toHaveBeenCalledWith('custom-room');
    });

    test('should remove room from roomIndex when empty', () => {
      helper.joinRoom({ clientId: 'client-1', room: 'custom-room' });
      helper.leaveRoom({ clientId: 'client-1', room: 'custom-room' });

      const roomClients = helper.getClientsByRoom({ room: 'custom-room' });
      expect(roomClients).toHaveLength(0);
    });

    test('should handle joinRoom for non-existent client', () => {
      expect(() => {
        helper.joinRoom({ clientId: 'non-existent', room: 'room' });
      }).not.toThrow();
    });

    test('should handle leaveRoom for non-existent client', () => {
      expect(() => {
        helper.leaveRoom({ clientId: 'non-existent', room: 'room' });
      }).not.toThrow();
    });

    test('should support multiple clients in same room', async () => {
      const socket2 = createMockSocket('client-2');
      await connectAndAuth(helper, { clientId: 'client-2', socket: socket2 });

      helper.joinRoom({ clientId: 'client-1', room: 'shared-room' });
      helper.joinRoom({ clientId: 'client-2', room: 'shared-room' });

      const roomClients = helper.getClientsByRoom({ room: 'shared-room' });
      expect(roomClients).toHaveLength(2);
    });

    test('should support client in multiple rooms', () => {
      helper.joinRoom({ clientId: 'client-1', room: 'room-a' });
      helper.joinRoom({ clientId: 'client-1', room: 'room-b' });
      helper.joinRoom({ clientId: 'client-1', room: 'room-c' });

      const client = helper.getClients({ id: 'client-1' }) as any;
      // Default rooms (2) + 3 custom rooms
      expect(client.rooms.size).toBe(5);
    });
  });

  // ---------------------------------------------------------------------------
  // Messaging — Local Delivery
  // ---------------------------------------------------------------------------
  describe('Messaging — Local Delivery', () => {
    beforeEach(async () => {
      const socket1 = createMockSocket('client-1');
      const socket2 = createMockSocket('client-2');
      const socket3 = createMockSocket('client-3');

      await connectAndAuth(helper, { clientId: 'client-1', socket: socket1, userId: 'user-1' });
      await connectAndAuth(helper, { clientId: 'client-2', socket: socket2, userId: 'user-1' });
      await connectAndAuth(helper, { clientId: 'client-3', socket: socket3, userId: 'user-2' });
    });

    describe('sendToClient()', () => {
      test('should send JSON string payload to specific client', () => {
        const client = helper.getClients({ id: 'client-1' }) as any;
        client.socket.send.mockClear();

        helper.sendToClient({
          clientId: 'client-1',
          event: 'test-event',
          data: { key: 'value' },
        });

        expect(client.socket.send).toHaveBeenCalledTimes(1);
        const calls = client.socket.send.mock.calls as any[][];
        // Payload is now a plain JSON string
        const payload = JSON.parse(calls[0][0]);
        expect(payload.event).toBe('test-event');
        expect(payload.data).toEqual({ key: 'value' });
      });

      test('should not throw for non-existent client', () => {
        expect(() => {
          helper.sendToClient({ clientId: 'ghost', event: 'test', data: {} });
        }).not.toThrow();
      });

      test('should handle socket.send throwing', () => {
        const client = helper.getClients({ id: 'client-1' }) as any;
        client.socket.send = mock(() => {
          throw new Error('write error');
        });

        expect(() => {
          helper.sendToClient({ clientId: 'client-1', event: 'test', data: {} });
        }).not.toThrow();
      });

      test('should set backpressured flag when send returns -1', () => {
        const client = helper.getClients({ id: 'client-1' }) as any;
        client.socket.send = mock(() => -1);

        helper.sendToClient({ clientId: 'client-1', event: 'test', data: {} });

        expect(client.backpressured).toBe(true);
      });

      test('should not set backpressured when send returns positive', () => {
        const client = helper.getClients({ id: 'client-1' }) as any;
        client.socket.send = mock(() => 42);

        helper.sendToClient({ clientId: 'client-1', event: 'test', data: {} });

        expect(client.backpressured).toBe(false);
      });
    });

    describe('sendToUser()', () => {
      test('should send to all clients of a user', () => {
        const client1 = helper.getClients({ id: 'client-1' }) as any;
        const client2 = helper.getClients({ id: 'client-2' }) as any;
        client1.socket.send.mockClear();
        client2.socket.send.mockClear();

        helper.sendToUser({ userId: 'user-1', event: 'user-event', data: { x: 1 } });

        expect(client1.socket.send).toHaveBeenCalledTimes(1);
        expect(client2.socket.send).toHaveBeenCalledTimes(1);
      });

      test('should not send to clients of different user', () => {
        const client3 = helper.getClients({ id: 'client-3' }) as any;
        client3.socket.send.mockClear();

        helper.sendToUser({ userId: 'user-1', event: 'user-event', data: {} });

        expect(client3.socket.send).not.toHaveBeenCalled();
      });

      test('should not throw for non-existent user', () => {
        expect(() => {
          helper.sendToUser({ userId: 'ghost', event: 'test', data: {} });
        }).not.toThrow();
      });
    });

    describe('sendToRoom()', () => {
      test('should use Bun server.publish for room delivery (no exclude)', () => {
        mockBunServer.publish.mockClear();

        helper.sendToRoom({ room: 'test-room', event: 'room-event', data: { y: 2 } });

        expect(mockBunServer.publish).toHaveBeenCalledTimes(1);
        const calls = mockBunServer.publish.mock.calls as any[][];
        expect(calls[0][0]).toBe('test-room');

        const parsed = JSON.parse(calls[0][1]);
        expect(parsed.event).toBe('room-event');
        expect(parsed.data).toEqual({ y: 2 });
      });

      test('should use slow path when exclude is provided', () => {
        // Join clients to a room
        helper.joinRoom({ clientId: 'client-1', room: 'my-room' });
        helper.joinRoom({ clientId: 'client-2', room: 'my-room' });
        helper.joinRoom({ clientId: 'client-3', room: 'my-room' });

        const c1 = helper.getClients({ id: 'client-1' }) as any;
        const c2 = helper.getClients({ id: 'client-2' }) as any;
        const c3 = helper.getClients({ id: 'client-3' }) as any;
        c1.socket.send.mockClear();
        c2.socket.send.mockClear();
        c3.socket.send.mockClear();
        mockBunServer.publish.mockClear();

        helper.sendToRoom({
          room: 'my-room',
          event: 'room-event',
          data: { x: 1 },
          exclude: ['client-2'],
        });

        // Should NOT use bunServer.publish (slow path)
        expect(mockBunServer.publish).not.toHaveBeenCalled();

        // Should send to client-1 and client-3, but not client-2
        expect(c1.socket.send).toHaveBeenCalledTimes(1);
        expect(c2.socket.send).not.toHaveBeenCalled();
        expect(c3.socket.send).toHaveBeenCalledTimes(1);
      });

      test('should handle exclude for non-existent room gracefully', () => {
        expect(() => {
          helper.sendToRoom({
            room: 'ghost-room',
            event: 'test',
            data: {},
            exclude: ['client-1'],
          });
        }).not.toThrow();
      });
    });

    describe('broadcast()', () => {
      test('should use Bun pub/sub broadcast topic (no exclude)', () => {
        mockBunServer.publish.mockClear();

        helper.broadcast({ event: 'broadcast-event', data: { msg: 'hello all' } });

        expect(mockBunServer.publish).toHaveBeenCalledTimes(1);
        const calls = mockBunServer.publish.mock.calls as any[][];
        expect(calls[0][0]).toBe(WebSocketDefaults.BROADCAST_TOPIC);

        const parsed = JSON.parse(calls[0][1]);
        expect(parsed.event).toBe('broadcast-event');
        expect(parsed.data).toEqual({ msg: 'hello all' });
      });

      test('should exclude specified clients (slow path)', () => {
        const c1 = helper.getClients({ id: 'client-1' }) as any;
        const c2 = helper.getClients({ id: 'client-2' }) as any;
        const c3 = helper.getClients({ id: 'client-3' }) as any;
        c1.socket.send.mockClear();
        c2.socket.send.mockClear();
        c3.socket.send.mockClear();
        mockBunServer.publish.mockClear();

        helper.broadcast({
          event: 'broadcast-event',
          data: {},
          exclude: ['client-1', 'client-3'],
        });

        // Should NOT use bunServer.publish (slow path with exclude)
        expect(mockBunServer.publish).not.toHaveBeenCalled();

        expect(c1.socket.send).not.toHaveBeenCalled();
        expect(c2.socket.send).toHaveBeenCalledTimes(1);
        expect(c3.socket.send).not.toHaveBeenCalled();
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Messaging — Public API (send)
  // ---------------------------------------------------------------------------
  describe('send() — Public API', () => {
    let redisPub: MockRedisClient;

    beforeEach(async () => {
      const socket = createMockSocket('client-1');
      await connectAndAuth(helper, { clientId: 'client-1', socket, userId: 'user-1' });

      // Get the redisPub mock
      const allDups = mockRedisHelper.mockClient.duplicate.mock.results;
      redisPub = allDups[0]?.value as MockRedisClient;
    });

    test('should send to specific client and publish to Redis', () => {
      redisPub.publish.mockClear();

      helper.send({
        destination: 'client-1',
        payload: { topic: 'hello', data: { msg: 'hi' } },
      });

      // Should send locally
      const client = helper.getClients({ id: 'client-1' }) as any;
      const lastCall = client.socket.send.mock.calls.at(-1);
      const parsed = JSON.parse(lastCall[0]);
      expect(parsed.event).toBe('hello');

      // Should publish to Redis
      expect(redisPub.publish).toHaveBeenCalled();
      const pubCalls = redisPub.publish.mock.calls as any[][];
      expect(pubCalls[0][0]).toBe(WebSocketChannels.forClient({ clientId: 'client-1' }));
    });

    test('should send to room and publish to Redis', () => {
      redisPub.publish.mockClear();

      // Join a room first
      helper.joinRoom({ clientId: 'client-1', room: 'my-room' });

      helper.send({
        destination: 'my-room',
        payload: { topic: 'room-msg', data: { x: 1 } },
      });

      // Should publish to Redis for room
      expect(redisPub.publish).toHaveBeenCalled();
      const pubCalls = redisPub.publish.mock.calls as any[][];
      expect(pubCalls[0][0]).toBe(WebSocketChannels.forRoom({ room: 'my-room' }));
    });

    test('should broadcast when no destination', () => {
      redisPub.publish.mockClear();

      helper.send({
        payload: { topic: 'broadcast-msg', data: { all: true } },
      });

      // Should publish broadcast to Redis
      expect(redisPub.publish).toHaveBeenCalled();
      const pubCalls = redisPub.publish.mock.calls as any[][];
      expect(pubCalls[0][0]).toBe(WebSocketChannels.BROADCAST);
    });

    test('should publish to Redis for unknown destination (other instance)', () => {
      redisPub.publish.mockClear();

      helper.send({
        destination: 'unknown-room-or-client',
        payload: { topic: 'msg', data: {} },
      });

      expect(redisPub.publish).toHaveBeenCalled();
    });

    test('should not send when payload is missing', () => {
      redisPub.publish.mockClear();

      helper.send({ payload: undefined as any });

      expect(redisPub.publish).not.toHaveBeenCalled();
    });

    test('should not send when topic is missing', () => {
      redisPub.publish.mockClear();

      helper.send({ payload: { topic: '', data: {} } });

      expect(redisPub.publish).not.toHaveBeenCalled();
    });

    test('should not send when data is undefined', () => {
      redisPub.publish.mockClear();

      helper.send({ payload: { topic: 'test', data: undefined as any } });

      expect(redisPub.publish).not.toHaveBeenCalled();
    });

    test('should invoke callback after sending', async () => {
      const cb = mock(() => {});

      helper.send({
        destination: 'client-1',
        payload: { topic: 'test', data: {} },
        cb,
      });

      await wait(10);
      expect(cb).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Redis Message Routing
  // ---------------------------------------------------------------------------
  describe('Redis Message Routing', () => {
    let redisSub: MockRedisClient;

    beforeEach(async () => {
      const socket1 = createMockSocket('client-1');
      const socket2 = createMockSocket('client-2');
      await connectAndAuth(helper, { clientId: 'client-1', socket: socket1, userId: 'user-1' });
      await connectAndAuth(helper, { clientId: 'client-2', socket: socket2, userId: 'user-2' });

      await helper.configure();

      const allDups = mockRedisHelper.mockClient.duplicate.mock.results;
      redisSub = allDups[1]?.value as MockRedisClient;
    });

    test('should route broadcast messages to all clients via broadcast topic', () => {
      mockBunServer.publish.mockClear();

      const redisMessage: IRedisSocketMessage = {
        serverId: 'other-server',
        type: 'broadcast',
        event: 'redis-broadcast',
        data: { from: 'redis' },
      };

      redisSub.emit('message', WebSocketChannels.BROADCAST, JSON.stringify(redisMessage));

      // Broadcast without exclude uses bunServer.publish with BROADCAST_TOPIC
      expect(mockBunServer.publish).toHaveBeenCalled();
      const calls = mockBunServer.publish.mock.calls as any[][];
      expect(calls[0][0]).toBe(WebSocketDefaults.BROADCAST_TOPIC);
    });

    test('should route client-targeted messages', () => {
      const c1 = helper.getClients({ id: 'client-1' }) as any;
      const c2 = helper.getClients({ id: 'client-2' }) as any;
      c1.socket.send.mockClear();
      c2.socket.send.mockClear();

      const redisMessage: IRedisSocketMessage = {
        serverId: 'other-server',
        type: 'client',
        target: 'client-1',
        event: 'private-msg',
        data: { secret: true },
      };

      redisSub.emit(
        'pmessage',
        WebSocketChannels.forClientPattern(),
        WebSocketChannels.forClient({ clientId: 'client-1' }),
        JSON.stringify(redisMessage),
      );

      expect(c1.socket.send).toHaveBeenCalled();
      expect(c2.socket.send).not.toHaveBeenCalled();
    });

    test('should route user-targeted messages', () => {
      const c1 = helper.getClients({ id: 'client-1' }) as any;
      const c2 = helper.getClients({ id: 'client-2' }) as any;
      c1.socket.send.mockClear();
      c2.socket.send.mockClear();

      const redisMessage: IRedisSocketMessage = {
        serverId: 'other-server',
        type: 'user',
        target: 'user-1',
        event: 'user-msg',
        data: {},
      };

      redisSub.emit(
        'pmessage',
        WebSocketChannels.forUserPattern(),
        WebSocketChannels.forUser({ userId: 'user-1' }),
        JSON.stringify(redisMessage),
      );

      expect(c1.socket.send).toHaveBeenCalled();
      expect(c2.socket.send).not.toHaveBeenCalled();
    });

    test('should route room-targeted messages via Bun pub/sub', () => {
      const redisMessage: IRedisSocketMessage = {
        serverId: 'other-server',
        type: 'room',
        target: 'my-room',
        event: 'room-msg',
        data: { roomData: true },
      };

      mockBunServer.publish.mockClear();

      redisSub.emit(
        'pmessage',
        WebSocketChannels.forRoomPattern(),
        WebSocketChannels.forRoom({ room: 'my-room' }),
        JSON.stringify(redisMessage),
      );

      expect(mockBunServer.publish).toHaveBeenCalledTimes(1);
      const pubCalls = mockBunServer.publish.mock.calls as any[][];
      expect(pubCalls[0][0]).toBe('my-room');
    });

    test('should skip messages from same server (dedup)', () => {
      const c1 = helper.getClients({ id: 'client-1' }) as any;
      c1.socket.send.mockClear();

      // We need the server's serverId — it's private, so we use a workaround:
      // Send a message and inspect Redis to find the serverId
      const redisPub = mockRedisHelper.mockClient.duplicate.mock.results[0]
        ?.value as MockRedisClient;
      redisPub.publish.mockClear();

      helper.send({
        payload: { topic: 'test', data: {} },
      });

      // Extract serverId from the published message
      const pubCalls = redisPub.publish.mock.calls as any[][];
      const publishedMsg = JSON.parse(pubCalls[0][1]);
      const serverId = publishedMsg.serverId;

      c1.socket.send.mockClear();
      mockBunServer.publish.mockClear();

      // Now simulate a Redis message from the SAME server
      const redisMessage: IRedisSocketMessage = {
        serverId, // Same server
        type: 'broadcast',
        event: 'should-skip',
        data: {},
      };

      redisSub.emit('message', WebSocketChannels.BROADCAST, JSON.stringify(redisMessage));

      // Should NOT have sent to client (deduplication)
      expect(c1.socket.send).not.toHaveBeenCalled();
      // Should NOT have used bunServer.publish either
      expect(mockBunServer.publish).not.toHaveBeenCalled();
    });

    test('should handle invalid JSON in Redis message', () => {
      expect(() => {
        redisSub.emit('message', WebSocketChannels.BROADCAST, 'not-json');
      }).not.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // Public Accessors
  // ---------------------------------------------------------------------------
  describe('Public Accessors', () => {
    beforeEach(async () => {
      const socket1 = createMockSocket('client-1');
      const socket2 = createMockSocket('client-2');
      await connectAndAuth(helper, { clientId: 'client-1', socket: socket1, userId: 'user-1' });
      await connectAndAuth(helper, { clientId: 'client-2', socket: socket2, userId: 'user-2' });
    });

    test('getClients() should return all clients', () => {
      const clients = helper.getClients() as Map<string, unknown>;
      expect(clients.size).toBe(2);
    });

    test('getClients({ id }) should return specific client', () => {
      const client = helper.getClients({ id: 'client-1' }) as any;
      expect(client).toBeDefined();
      expect(client.id).toBe('client-1');
    });

    test('getClients({ id }) should return undefined for non-existent client', () => {
      const client = helper.getClients({ id: 'ghost' });
      expect(client).toBeUndefined();
    });

    test('getClientsByUser() should return clients for user', () => {
      const clients = helper.getClientsByUser({ userId: 'user-1' });
      expect(clients).toHaveLength(1);
    });

    test('getClientsByUser() should return empty for unknown user', () => {
      const clients = helper.getClientsByUser({ userId: 'unknown' });
      expect(clients).toHaveLength(0);
    });

    test('getClientsByRoom() should return clients in room', () => {
      const clients = helper.getClientsByRoom({ room: WebSocketDefaults.ROOM });
      expect(clients).toHaveLength(2);
    });

    test('getClientsByRoom() should return empty for unknown room', () => {
      const clients = helper.getClientsByRoom({ room: 'unknown' });
      expect(clients).toHaveLength(0);
    });

    test('getPath() should return configured path', () => {
      expect(helper.getPath()).toBe('/ws');
    });
  });

  // ---------------------------------------------------------------------------
  // Shutdown
  // ---------------------------------------------------------------------------
  describe('shutdown()', () => {
    test('should disconnect all clients', async () => {
      const socket1 = createMockSocket('client-1');
      const socket2 = createMockSocket('client-2');
      helper.onClientConnect({ clientId: 'client-1', socket: socket1 });
      helper.onClientConnect({ clientId: 'client-2', socket: socket2 });

      await helper.shutdown();

      expect(socket1.close).toHaveBeenCalledWith(1001, 'Server shutting down');
      expect(socket2.close).toHaveBeenCalledWith(1001, 'Server shutting down');
    });

    test('should clear all maps', async () => {
      const socket = createMockSocket('client-1');
      await connectAndAuth(helper, { clientId: 'client-1', socket, userId: 'user-1' });

      await helper.shutdown();

      const clients = helper.getClients() as Map<string, unknown>;
      expect(clients.size).toBe(0);
    });

    test('should quit Redis connections', async () => {
      const redisPub = mockRedisHelper.mockClient.duplicate.mock.results[0]
        ?.value as MockRedisClient;
      const redisSub = mockRedisHelper.mockClient.duplicate.mock.results[1]
        ?.value as MockRedisClient;

      await helper.shutdown();

      expect(redisPub.quit).toHaveBeenCalled();
      expect(redisSub.quit).toHaveBeenCalled();
    });

    test('should handle socket.close() throwing during shutdown', async () => {
      const socket = createMockSocket('client-1');
      socket.close = mock(() => {
        throw new Error('already closed');
      });
      helper.onClientConnect({ clientId: 'client-1', socket });

      expect(async () => helper.shutdown()).not.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // Edge Cases
  // ---------------------------------------------------------------------------
  describe('Edge Cases', () => {
    test('should handle rapid connect/disconnect', () => {
      for (let i = 0; i < 50; i++) {
        const socket = createMockSocket(`client-${i}`);
        helper.onClientConnect({ clientId: `client-${i}`, socket });
        helper.onClientDisconnect({ clientId: `client-${i}` });
      }

      const clients = helper.getClients() as Map<string, unknown>;
      expect(clients.size).toBe(0);
    });

    test('should handle many concurrent clients', async () => {
      // Connect and authenticate 100 clients in batch
      for (let i = 0; i < 100; i++) {
        const socket = createMockSocket(`client-${i}`);
        helper.onClientConnect({ clientId: `client-${i}`, socket });
        helper.onClientMessage({
          clientId: `client-${i}`,
          raw: JSON.stringify({
            event: WebSocketEvents.AUTHENTICATE,
            data: { userId: `user-${i % 10}` },
          }),
        });
      }
      await wait(50);

      const clients = helper.getClients() as Map<string, unknown>;
      expect(clients.size).toBe(100);

      // Each of 10 users should have 10 clients
      for (let u = 0; u < 10; u++) {
        const userClients = helper.getClientsByUser({ userId: `user-${u}` });
        expect(userClients).toHaveLength(10);
      }
    });

    test('should handle client joining and leaving many rooms', async () => {
      const socket = createMockSocket('client-1');
      await connectAndAuth(helper, { clientId: 'client-1', socket });

      for (let i = 0; i < 50; i++) {
        helper.joinRoom({ clientId: 'client-1', room: `room-${i}` });
      }

      const client = helper.getClients({ id: 'client-1' }) as any;
      // 2 default rooms + 50 custom rooms
      expect(client.rooms.size).toBe(52);

      for (let i = 0; i < 50; i++) {
        helper.leaveRoom({ clientId: 'client-1', room: `room-${i}` });
      }

      // Only default rooms remain
      expect(client.rooms.size).toBe(2);
    });

    test('should handle message with null data', async () => {
      const messageHandler = mock(() => {});
      const msgHelper = new WebSocketServerHelper({
        ...opts,
        messageHandler,
      });
      const socket = createMockSocket('client-1');
      await connectAndAuth(msgHelper, { clientId: 'client-1', socket });

      msgHelper.onClientMessage({
        clientId: 'client-1',
        raw: JSON.stringify({ event: 'event', data: null }),
      });

      expect(messageHandler).toHaveBeenCalledWith({
        clientId: 'client-1',
        userId: 'user-1',
        message: { event: 'event', data: null },
      });
    });

    test('should handle sending to empty room', () => {
      expect(() => {
        helper.sendToRoom({ room: 'empty-room', event: 'test', data: {} });
      }).not.toThrow();
    });

    test('should handle broadcasting with no clients', async () => {
      const emptyHelper = new WebSocketServerHelper(opts);

      expect(() => {
        emptyHelper.broadcast({ event: 'test', data: {} });
      }).not.toThrow();

      await emptyHelper.shutdown();
    });

    test('heartbeat event in onClientMessage returns silently (no messageHandler call)', async () => {
      const messageHandler = mock(() => {});
      const hbHelper = new WebSocketServerHelper({ ...opts, messageHandler });
      const socket = createMockSocket('client-1');
      await connectAndAuth(hbHelper, { clientId: 'client-1', socket, userId: 'user-1' });

      hbHelper.onClientMessage({
        clientId: 'client-1',
        raw: JSON.stringify({ event: WebSocketEvents.HEARTBEAT }),
      });

      expect(messageHandler).not.toHaveBeenCalled();
      await hbHelper.shutdown();
    });

    test('heartbeat event from unauthenticated client is silently ignored', () => {
      const socket = createMockSocket('client-1');
      helper.onClientConnect({ clientId: 'client-1', socket });

      socket.send.mockClear();
      helper.onClientMessage({
        clientId: 'client-1',
        raw: JSON.stringify({ event: WebSocketEvents.HEARTBEAT }),
      });

      // Should NOT send "Not authenticated" error — heartbeat returns early before that guard
      expect(socket.send).not.toHaveBeenCalled();
    });

    test('should handle validateRoomFn returning empty array', async () => {
      const validateFn = mock(() => []);
      const joinHelper = new WebSocketServerHelper({
        ...opts,
        validateRoomFn: validateFn,
      });
      const socket = createMockSocket('client-1');
      await connectAndAuth(joinHelper, { clientId: 'client-1', socket });

      joinHelper.onClientMessage({
        clientId: 'client-1',
        raw: JSON.stringify({
          event: WebSocketEvents.JOIN,
          data: { rooms: ['room-x'] },
        }),
      });

      await wait(50);

      const client = joinHelper.getClients({ id: 'client-1' }) as any;
      expect(client.rooms.has('room-x')).toBe(false);
    });

    test('should handle validateRoomFn that rejects', async () => {
      const rejectFn = mock(async (): Promise<string[]> => {
        throw new Error('validate error');
      });
      const joinHelper = new WebSocketServerHelper({
        ...opts,
        validateRoomFn: rejectFn,
      });
      const socket = createMockSocket('client-1');
      await connectAndAuth(joinHelper, { clientId: 'client-1', socket });

      // Async rejection is caught by Promise.resolve().then().catch()
      expect(() => {
        joinHelper.onClientMessage({
          clientId: 'client-1',
          raw: JSON.stringify({
            event: WebSocketEvents.JOIN,
            data: { rooms: ['room-x'] },
          }),
        });
      }).not.toThrow();

      await wait(50);

      // Room should not have been joined
      const client = joinHelper.getClients({ id: 'client-1' }) as any;
      expect(client.rooms.has('room-x')).toBe(false);
    });
  });
});

// =============================================================================
// Heartbeat — Application-Level Liveness Check
// =============================================================================

describe('Heartbeat — Application-Level Liveness Check', () => {
  let helper: WebSocketServerHelper;
  let opts: IWebSocketServerOptions;
  let mockBunServer: ReturnType<typeof createMockBunServer>;
  let mockRedisHelper: DefaultRedisHelper & { mockClient: MockRedisClient };

  beforeEach(() => {
    mockBunServer = createMockBunServer();
    mockRedisHelper = createMockRedisHelper();

    opts = {
      identifier: 'test-heartbeat',
      server: mockBunServer,
      redisConnection: mockRedisHelper,
      authenticateFn: mock((data: Record<string, unknown>) => ({
        userId: (data.userId as string) ?? 'user-1',
      })),
      heartbeatInterval: 100, // Fast interval for testing
      heartbeatTimeout: 250, // Fast timeout for testing
    };

    helper = new WebSocketServerHelper(opts);
  });

  afterEach(async () => {
    try {
      await helper.shutdown();
    } catch {
      // Ignore
    }
  });

  test('custom heartbeatInterval/heartbeatTimeout options are respected', () => {
    // Verify the helper was constructed without error using custom values
    expect(helper).toBeDefined();
  });

  test('HEARTBEAT_INTERVAL and HEARTBEAT_TIMEOUT defaults exist', () => {
    expect(WebSocketDefaults.HEARTBEAT_INTERVAL).toBe(30_000);
    expect(WebSocketDefaults.HEARTBEAT_TIMEOUT).toBe(90_000);
  });

  test('heartbeatAll disconnects authenticated clients whose lastActivity exceeds heartbeatTimeout', async () => {
    const socket = createMockSocket('client-1');
    await connectAndAuth(helper, { clientId: 'client-1', socket, userId: 'user-1' });

    // Artificially age the client's lastActivity beyond the timeout
    const client = helper.getClients({ id: 'client-1' }) as any;
    client.lastActivity = Date.now() - 300; // 300ms ago, timeout is 250ms

    // Trigger heartbeat cycle via configure (starts timer)
    await helper.configure();

    // Wait for at least one heartbeat interval
    await wait(150);

    expect(socket.close).toHaveBeenCalledWith(4002, 'Heartbeat timeout');
  });

  test('heartbeatAll does NOT disconnect active clients (recent lastActivity)', async () => {
    const socket = createMockSocket('client-1');
    await connectAndAuth(helper, { clientId: 'client-1', socket, userId: 'user-1' });

    // lastActivity is fresh (set during connectAndAuth)
    await helper.configure();

    // Wait for heartbeat cycle
    await wait(150);

    // socket.close should NOT have been called (only the shutdown will call it)
    expect(socket.close).not.toHaveBeenCalled();
  });

  test('heartbeatAll skips unauthorized clients', async () => {
    const socket = createMockSocket('client-1');
    helper.onClientConnect({ clientId: 'client-1', socket });

    // Artificially age the unauthorized client
    const client = helper.getClients({ id: 'client-1' }) as any;
    client.lastActivity = Date.now() - 500;

    await helper.configure();
    await wait(150);

    // Should NOT be closed by heartbeat (auth timeout handles these separately)
    expect(socket.close).not.toHaveBeenCalled();
  });

  test('socket.close(4002) called with correct code and reason', async () => {
    const socket = createMockSocket('client-1');
    await connectAndAuth(helper, { clientId: 'client-1', socket, userId: 'user-1' });

    const client = helper.getClients({ id: 'client-1' }) as any;
    client.lastActivity = Date.now() - 300;

    await helper.configure();
    await wait(150);

    const closeCalls = socket.close.mock.calls as any[][];
    const timeoutCall = closeCalls.find(c => c[0] === 4002);
    expect(timeoutCall).toBeDefined();
    expect(timeoutCall![1]).toBe('Heartbeat timeout');
  });

  test('shutdown clears the heartbeat timer', async () => {
    await helper.configure();

    // Shutdown should clear the timer without errors
    await helper.shutdown();

    // Wait to ensure no heartbeat fires after shutdown
    await wait(200);
    // If timer wasn't cleared, this would potentially throw or have side effects
  });

  test('heartbeat sweep does NOT broadcast to clients (server is passive)', async () => {
    const socket = createMockSocket('client-1');
    await connectAndAuth(helper, { clientId: 'client-1', socket, userId: 'user-1' });

    mockBunServer.publish.mockClear();
    await helper.configure();
    await wait(150);

    // Server should NOT publish any heartbeat event — clients send heartbeat, server only sweeps
    const publishCalls = mockBunServer.publish.mock.calls as any[][];
    const heartbeatCall = publishCalls.find(c => {
      try {
        const parsed = JSON.parse(c[1]);
        return parsed.event === WebSocketEvents.HEARTBEAT;
      } catch {
        return false;
      }
    });
    expect(heartbeatCall).toBeUndefined();
  });
});

// =============================================================================
// WebSocketEmitter Tests
// =============================================================================

describe('WebSocketEmitter', () => {
  let emitter: WebSocketEmitter;
  let mockRedisHelper: DefaultRedisHelper & { mockClient: MockRedisClient };
  let redisPub: MockRedisClient;

  beforeEach(() => {
    mockRedisHelper = createMockRedisHelper();
    emitter = new WebSocketEmitter({
      redisConnection: mockRedisHelper,
    });

    // Get the duplicated redisPub
    redisPub = mockRedisHelper.mockClient.duplicate.mock.results[0]?.value as MockRedisClient;
  });

  afterEach(async () => {
    try {
      await emitter.shutdown();
    } catch {
      // Ignore errors during cleanup
    }
  });

  // ---------------------------------------------------------------------------
  // Constructor
  // ---------------------------------------------------------------------------
  describe('Constructor', () => {
    test('should create emitter with default identifier', () => {
      expect(emitter.identifier).toBe('WebSocketEmitter');
    });

    test('should create emitter with custom identifier', () => {
      const customEmitter = new WebSocketEmitter({
        identifier: 'custom-emitter',
        redisConnection: mockRedisHelper,
      });
      expect(customEmitter.identifier).toBe('custom-emitter');
    });

    test('should throw when redisConnection is null', () => {
      expect(() => {
        new WebSocketEmitter({ redisConnection: null as any });
      }).toThrow('Invalid redis connection');
    });

    test('should duplicate Redis client', () => {
      expect(mockRedisHelper.mockClient.duplicate).toHaveBeenCalledTimes(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Configure
  // ---------------------------------------------------------------------------
  describe('configure()', () => {
    test('should complete when Redis is ready', async () => {
      await emitter.configure();
      // If no throw, it passed
    });

    test('should connect Redis if in wait status', async () => {
      const waitClient = new MockRedisClient();
      waitClient.status = 'wait';

      const waitRedisHelper = {
        getClient: () => waitClient,
      } as unknown as DefaultRedisHelper;

      const waitEmitter = new WebSocketEmitter({
        redisConnection: waitRedisHelper,
      });

      await waitEmitter.configure();
    });
  });

  // ---------------------------------------------------------------------------
  // Emit Methods
  // ---------------------------------------------------------------------------
  describe('toClient()', () => {
    test('should publish to Redis with correct channel', async () => {
      await emitter.toClient({ clientId: 'c1', event: 'hello', data: { x: 1 } });

      expect(redisPub.publish).toHaveBeenCalledTimes(1);
      const calls = redisPub.publish.mock.calls as any[][];
      expect(calls[0][0]).toBe(WebSocketChannels.forClient({ clientId: 'c1' }));

      const message: IRedisSocketMessage = JSON.parse(calls[0][1]);
      expect(message.serverId).toBe('emitter');
      expect(message.type).toBe('client');
      expect(message.target).toBe('c1');
      expect(message.event).toBe('hello');
      expect(message.data).toEqual({ x: 1 });
    });
  });

  describe('toUser()', () => {
    test('should publish to Redis with correct channel', async () => {
      await emitter.toUser({ userId: 'u1', event: 'notify', data: { msg: 'hi' } });

      expect(redisPub.publish).toHaveBeenCalledTimes(1);
      const calls = redisPub.publish.mock.calls as any[][];
      expect(calls[0][0]).toBe(WebSocketChannels.forUser({ userId: 'u1' }));

      const message: IRedisSocketMessage = JSON.parse(calls[0][1]);
      expect(message.serverId).toBe('emitter');
      expect(message.type).toBe('user');
      expect(message.target).toBe('u1');
      expect(message.event).toBe('notify');
    });
  });

  describe('toRoom()', () => {
    test('should publish to Redis with correct channel', async () => {
      await emitter.toRoom({ room: 'lobby', event: 'update', data: { status: 'active' } });

      expect(redisPub.publish).toHaveBeenCalledTimes(1);
      const calls = redisPub.publish.mock.calls as any[][];
      expect(calls[0][0]).toBe(WebSocketChannels.forRoom({ room: 'lobby' }));

      const message: IRedisSocketMessage = JSON.parse(calls[0][1]);
      expect(message.type).toBe('room');
      expect(message.target).toBe('lobby');
    });

    test('should include exclude list when provided', async () => {
      await emitter.toRoom({
        room: 'lobby',
        event: 'update',
        data: {},
        exclude: ['c1', 'c2'],
      });

      const calls = redisPub.publish.mock.calls as any[][];
      const msg: IRedisSocketMessage = JSON.parse(calls[0][1]);
      expect(msg.exclude).toEqual(['c1', 'c2']);
    });
  });

  describe('broadcast()', () => {
    test('should publish to broadcast channel', async () => {
      await emitter.broadcast({ event: 'global', data: { announcement: true } });

      expect(redisPub.publish).toHaveBeenCalledTimes(1);
      const calls = redisPub.publish.mock.calls as any[][];
      expect(calls[0][0]).toBe(WebSocketChannels.BROADCAST);

      const message: IRedisSocketMessage = JSON.parse(calls[0][1]);
      expect(message.serverId).toBe('emitter');
      expect(message.type).toBe('broadcast');
      expect(message.event).toBe('global');
    });
  });

  // ---------------------------------------------------------------------------
  // Emitter Server ID
  // ---------------------------------------------------------------------------
  describe('Emitter Server ID', () => {
    test('should always use "emitter" as serverId', async () => {
      await emitter.toClient({ clientId: 'c1', event: 'test', data: {} });
      await emitter.toUser({ userId: 'u1', event: 'test', data: {} });
      await emitter.toRoom({ room: 'r1', event: 'test', data: {} });
      await emitter.broadcast({ event: 'test', data: {} });

      const calls = redisPub.publish.mock.calls as any[][];
      for (const call of calls) {
        const msg: IRedisSocketMessage = JSON.parse(call[1]);
        expect(msg.serverId).toBe('emitter');
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Shutdown
  // ---------------------------------------------------------------------------
  describe('shutdown()', () => {
    test('should quit Redis connection', async () => {
      await emitter.shutdown();
      expect(redisPub.quit).toHaveBeenCalled();
    });

    test('should not throw on multiple shutdowns', async () => {
      await emitter.shutdown();
      expect(async () => emitter.shutdown()).not.toThrow();
    });
  });
});
