/**
 * Socket.IO Component Test Suite
 *
 * Tests for the SocketIOComponent and related functionality.
 *
 * Note: Full integration tests with SocketIOServerHelper require a running Redis instance
 * because the socket.io-redis-adapter needs real Redis pub/sub functionality.
 * These tests focus on component-level validation and client helper functionality.
 *
 * Test Categories:
 * 1. SocketIOComponent Unit Tests - Binding validation, configuration
 * 2. SocketIOClientHelper Unit Tests - State management, lifecycle
 * 3. SocketIOBindingKeys Tests - Key constants
 *
 * For full integration tests with server-client communication,
 * run with a Redis instance available and use the integration test suite.
 *
 * @module __tests__/socket-io
 */

import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import { createServer, Server as HTTPServer } from 'node:http';
import { AddressInfo } from 'node:net';
import { Server as IOServer } from 'socket.io';
import {
  SocketIOClientHelper,
  SocketIOConstants,
  SocketIOClientStates,
} from '@venizia/ignis-helpers/socket-io';
import { SocketIOBindingKeys } from '@/components/socket-io/common/keys';

// =============================================================================
// Test Utilities
// =============================================================================

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const waitFor = async (
  condition: () => boolean,
  opts: { timeout?: number; interval?: number } = {},
): Promise<void> => {
  const { timeout = 5000, interval = 50 } = opts;
  const start = Date.now();

  while (!condition()) {
    if (Date.now() - start > timeout) {
      throw new Error(`waitFor timed out after ${timeout}ms`);
    }
    await wait(interval);
  }
};

const getAvailablePort = (): Promise<number> => {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, () => {
      const address = server.address() as AddressInfo;
      server.close(err => {
        if (err) {
          reject(err);
        } else {
          resolve(address.port);
        }
      });
    });
  });
};

// =============================================================================
// SocketIOBindingKeys Tests
// =============================================================================

describe('SocketIOBindingKeys', () => {
  test('should have correct binding key for SOCKET_IO_INSTANCE', () => {
    expect(SocketIOBindingKeys.SOCKET_IO_INSTANCE).toBe('@app/socket-io/instance');
  });

  test('should have correct binding key for SERVER_OPTIONS', () => {
    expect(SocketIOBindingKeys.SERVER_OPTIONS).toBe('@app/socket-io/server-options');
  });

  test('should have correct binding key for REDIS_CONNECTION', () => {
    expect(SocketIOBindingKeys.REDIS_CONNECTION).toBe('@app/socket-io/redis-connection');
  });

  test('should have correct binding key for AUTHENTICATE_HANDLER', () => {
    expect(SocketIOBindingKeys.AUTHENTICATE_HANDLER).toBe('@app/socket-io/authenticate-handler');
  });

  test('should have correct binding key for CLIENT_CONNECTED_HANDLER', () => {
    expect(SocketIOBindingKeys.CLIENT_CONNECTED_HANDLER).toBe(
      '@app/socket-io/client-connected-handler',
    );
  });
});

// =============================================================================
// SocketIOConstants Tests
// =============================================================================

describe('SocketIOConstants', () => {
  test('should have correct event constants', () => {
    expect(SocketIOConstants.EVENT_PING).toBe('ping');
    expect(SocketIOConstants.EVENT_CONNECT).toBe('connection');
    expect(SocketIOConstants.EVENT_DISCONNECT).toBe('disconnect');
    expect(SocketIOConstants.EVENT_JOIN).toBe('join');
    expect(SocketIOConstants.EVENT_LEAVE).toBe('leave');
    expect(SocketIOConstants.EVENT_AUTHENTICATE).toBe('authenticate');
    expect(SocketIOConstants.EVENT_AUTHENTICATED).toBe('authenticated');
    expect(SocketIOConstants.EVENT_UNAUTHENTICATE).toBe('unauthenticated');
  });

  test('should have correct room constants', () => {
    expect(SocketIOConstants.ROOM_DEFAULT).toBe('io-default');
    expect(SocketIOConstants.ROOM_NOTIFICATION).toBe('io-notification');
  });
});

// =============================================================================
// SocketIOClientStates Tests
// =============================================================================

describe('SocketIOClientStates', () => {
  test('should have correct state values', () => {
    expect(SocketIOClientStates.UNAUTHORIZED).toBe('unauthorized');
    expect(SocketIOClientStates.AUTHENTICATING).toBe('authenticating');
    expect(SocketIOClientStates.AUTHENTICATED).toBe('authenticated');
  });

  test('should validate correct states with isValid()', () => {
    expect(SocketIOClientStates.isValid('unauthorized')).toBe(true);
    expect(SocketIOClientStates.isValid('authenticating')).toBe(true);
    expect(SocketIOClientStates.isValid('authenticated')).toBe(true);
  });

  test('should reject invalid states with isValid()', () => {
    expect(SocketIOClientStates.isValid('invalid')).toBe(false);
    expect(SocketIOClientStates.isValid('')).toBe(false);
    expect(SocketIOClientStates.isValid('UNAUTHORIZED')).toBe(false);
  });
});

// =============================================================================
// SocketIOClientHelper Tests (with simple mock server)
// =============================================================================

describe('SocketIOClientHelper', () => {
  let httpServer: HTTPServer;
  let ioServer: IOServer;
  let port: number;
  let activeClients: SocketIOClientHelper[] = [];

  beforeEach(async () => {
    activeClients = [];
    port = await getAvailablePort();
    httpServer = createServer();

    await new Promise<void>(resolve => {
      httpServer.listen(port, () => resolve());
    });

    ioServer = new IOServer(httpServer, {
      path: '/io',
      cors: { origin: '*' },
    });
  });

  afterEach(async () => {
    // Cleanup all active clients first
    for (const client of activeClients) {
      try {
        client.shutdown();
      } catch {
        // Ignore errors during cleanup
      }
    }
    activeClients = [];

    // Close socket.io server
    try {
      ioServer.close();
    } catch {
      // Ignore errors
    }

    // Close HTTP server with timeout
    await Promise.race([
      new Promise<void>(resolve => {
        httpServer.close(() => resolve());
      }),
      wait(1000).then(() => {}), // Timeout after 1 second
    ]);
  });

  // Helper to track clients for cleanup
  /* const _createClient = (opts?: Record<string, any>): SocketIOClientHelper => {
    const client = new SocketIOClientHelper({
      identifier: 'test-client',
      host: `http://localhost:${port}`,
      options: {
        path: '/io',
        extraHeaders: {},
        ...opts,
      } as any,
      ...opts,
    });
    activeClients.push(client);
    return client;
  }; */

  describe('Constructor & Initialization', () => {
    test('should initialize with UNAUTHORIZED state', () => {
      const client = new SocketIOClientHelper({
        identifier: 'test-client',
        host: `http://localhost:${port}`,
        options: {
          path: '/io',
          extraHeaders: {},
        } as any,
      });

      expect(client.getState()).toBe(SocketIOClientStates.UNAUTHORIZED);
      client.shutdown();
    });

    test('should store identifier correctly', () => {
      const client = new SocketIOClientHelper({
        identifier: 'my-unique-client',
        host: `http://localhost:${port}`,
        options: {
          path: '/io',
          extraHeaders: {},
        } as any,
      });

      expect(client.identifier).toBe('my-unique-client');
      client.shutdown();
    });

    test('should create socket client on construction', () => {
      const client = new SocketIOClientHelper({
        identifier: 'test-client',
        host: `http://localhost:${port}`,
        options: {
          path: '/io',
          extraHeaders: {},
        } as any,
      });

      expect(client.getSocketClient()).toBeDefined();
      client.shutdown();
    });
  });

  describe('Connection Lifecycle', () => {
    test('should connect to server', async () => {
      let isConnected = false;

      const client = new SocketIOClientHelper({
        identifier: 'test-client',
        host: `http://localhost:${port}`,
        options: {
          path: '/io',
          extraHeaders: {},
        } as any,
        onConnected: () => {
          isConnected = true;
        },
      });

      await waitFor(() => isConnected, { timeout: 3000 });
      expect(client.getSocketClient().connected).toBe(true);

      client.shutdown();
    });

    test('should call onConnected callback when connected', async () => {
      const onConnectedMock = mock(() => {});

      const client = new SocketIOClientHelper({
        identifier: 'test-client',
        host: `http://localhost:${port}`,
        options: {
          path: '/io',
          extraHeaders: {},
        } as any,
        onConnected: onConnectedMock,
      });

      await waitFor(() => client.getSocketClient().connected, { timeout: 3000 });
      await wait(50);

      expect(onConnectedMock).toHaveBeenCalled();

      client.shutdown();
    });

    test('should call onDisconnected callback when disconnected', async () => {
      let disconnectReason = '';

      const client = new SocketIOClientHelper({
        identifier: 'test-client',
        host: `http://localhost:${port}`,
        options: {
          path: '/io',
          extraHeaders: {},
        } as any,
        onDisconnected: reason => {
          disconnectReason = reason;
        },
      });

      await waitFor(() => client.getSocketClient().connected, { timeout: 3000 });

      client.disconnect();

      await waitFor(() => disconnectReason !== '', { timeout: 3000 });
      expect(disconnectReason).toBeDefined();

      client.shutdown();
    });

    test('should reset state to UNAUTHORIZED on disconnect', async () => {
      const client = new SocketIOClientHelper({
        identifier: 'test-client',
        host: `http://localhost:${port}`,
        options: {
          path: '/io',
          extraHeaders: {},
        } as any,
      });

      await waitFor(() => client.getSocketClient().connected, { timeout: 3000 });

      client.disconnect();

      await waitFor(() => !client.getSocketClient().connected, { timeout: 3000 });
      expect(client.getState()).toBe(SocketIOClientStates.UNAUTHORIZED);

      client.shutdown();
    });
  });

  describe('Authentication', () => {
    test('should not authenticate when not connected', () => {
      const client = new SocketIOClientHelper({
        identifier: 'test-client',
        host: `http://localhost:99999`, // Invalid port - won't connect
        options: {
          path: '/io',
          extraHeaders: {},
        } as any,
      });

      // Try to authenticate before connection
      client.authenticate();

      // State should remain UNAUTHORIZED
      expect(client.getState()).toBe(SocketIOClientStates.UNAUTHORIZED);

      client.shutdown();
    });

    test('should transition to AUTHENTICATING when authenticate() called', async () => {
      const client = new SocketIOClientHelper({
        identifier: 'test-client',
        host: `http://localhost:${port}`,
        options: {
          path: '/io',
          extraHeaders: {},
        } as any,
      });

      await waitFor(() => client.getSocketClient().connected, { timeout: 3000 });

      client.authenticate();

      expect(client.getState()).toBe(SocketIOClientStates.AUTHENTICATING);

      client.shutdown();
    });

    test('should emit authenticate event to server', async () => {
      let didServerReceiveAuth = false;

      ioServer.on('connection', socket => {
        socket.on(SocketIOConstants.EVENT_AUTHENTICATE, () => {
          didServerReceiveAuth = true;
        });
      });

      const client = new SocketIOClientHelper({
        identifier: 'test-client',
        host: `http://localhost:${port}`,
        options: {
          path: '/io',
          extraHeaders: {},
        } as any,
      });

      await waitFor(() => client.getSocketClient().connected, { timeout: 3000 });

      client.authenticate();

      await waitFor(() => didServerReceiveAuth, { timeout: 3000 });
      expect(didServerReceiveAuth).toBe(true);

      client.shutdown();
    });

    test('should transition to AUTHENTICATED when server sends authenticated event', async () => {
      ioServer.on('connection', socket => {
        socket.on(SocketIOConstants.EVENT_AUTHENTICATE, () => {
          socket.emit(SocketIOConstants.EVENT_AUTHENTICATED, { id: socket.id });
        });
      });

      let isAuthenticated = false;

      const client = new SocketIOClientHelper({
        identifier: 'test-client',
        host: `http://localhost:${port}`,
        options: {
          path: '/io',
          extraHeaders: {},
        } as any,
        onAuthenticated: () => {
          isAuthenticated = true;
        },
      });

      await waitFor(() => client.getSocketClient().connected, { timeout: 3000 });

      client.authenticate();

      await waitFor(() => isAuthenticated, { timeout: 3000 });
      expect(client.getState()).toBe(SocketIOClientStates.AUTHENTICATED);

      client.shutdown();
    });

    test('should transition to UNAUTHORIZED when server sends unauthenticated event', async () => {
      ioServer.on('connection', socket => {
        socket.on(SocketIOConstants.EVENT_AUTHENTICATE, () => {
          socket.emit(SocketIOConstants.EVENT_UNAUTHENTICATE, { message: 'Invalid token' });
        });
      });

      let unauthMessage = '';

      const client = new SocketIOClientHelper({
        identifier: 'test-client',
        host: `http://localhost:${port}`,
        options: {
          path: '/io',
          extraHeaders: {},
        } as any,
        onUnauthenticated: message => {
          unauthMessage = message;
        },
      });

      await waitFor(() => client.getSocketClient().connected, { timeout: 3000 });

      client.authenticate();

      await waitFor(() => unauthMessage !== '', { timeout: 3000 });
      expect(client.getState()).toBe(SocketIOClientStates.UNAUTHORIZED);
      expect(unauthMessage).toBe('Invalid token');

      client.shutdown();
    });

    test('should not allow authentication when already authenticated', async () => {
      ioServer.on('connection', socket => {
        socket.on(SocketIOConstants.EVENT_AUTHENTICATE, () => {
          socket.emit(SocketIOConstants.EVENT_AUTHENTICATED, { id: socket.id });
        });
      });

      const client = new SocketIOClientHelper({
        identifier: 'test-client',
        host: `http://localhost:${port}`,
        options: {
          path: '/io',
          extraHeaders: {},
        } as any,
      });

      await waitFor(() => client.getSocketClient().connected, { timeout: 3000 });

      client.authenticate();

      await waitFor(() => client.getState() === SocketIOClientStates.AUTHENTICATED, {
        timeout: 3000,
      });

      // Try to authenticate again
      client.authenticate();

      // Should still be AUTHENTICATED (not AUTHENTICATING)
      expect(client.getState()).toBe(SocketIOClientStates.AUTHENTICATED);

      client.shutdown();
    });
  });

  describe('Subscribe/Unsubscribe', () => {
    test('should subscribe to events', async () => {
      let receivedData: any = null;

      const client = new SocketIOClientHelper({
        identifier: 'test-client',
        host: `http://localhost:${port}`,
        options: {
          path: '/io',
          extraHeaders: {},
        } as any,
      });

      await waitFor(() => client.getSocketClient().connected, { timeout: 3000 });

      client.subscribe({
        event: 'test-event',
        handler: data => {
          receivedData = data;
        },
      });

      // Server sends event
      const clientSocket = Array.from(ioServer.sockets.sockets.values())[0];
      clientSocket.emit('test-event', { message: 'Hello' });

      await waitFor(() => receivedData !== null, { timeout: 3000 });
      expect(receivedData.message).toBe('Hello');

      client.shutdown();
    });

    test('should not add duplicate handler when ignoreDuplicate is true', async () => {
      let callCount = 0;

      const client = new SocketIOClientHelper({
        identifier: 'test-client',
        host: `http://localhost:${port}`,
        options: {
          path: '/io',
          extraHeaders: {},
        } as any,
      });

      await waitFor(() => client.getSocketClient().connected, { timeout: 3000 });

      const handler = () => {
        callCount++;
      };

      // Subscribe twice with ignoreDuplicate (default is true)
      client.subscribe({ event: 'test-event', handler });
      client.subscribe({ event: 'test-event', handler });

      // Server sends event
      const clientSocket = Array.from(ioServer.sockets.sockets.values())[0];
      clientSocket.emit('test-event', {});

      await wait(100);

      // Should only be called once
      expect(callCount).toBe(1);

      client.shutdown();
    });

    test('should add duplicate handler when ignoreDuplicate is false', async () => {
      let callCount = 0;

      const client = new SocketIOClientHelper({
        identifier: 'test-client',
        host: `http://localhost:${port}`,
        options: {
          path: '/io',
          extraHeaders: {},
        } as any,
      });

      await waitFor(() => client.getSocketClient().connected, { timeout: 3000 });

      const handler = () => {
        callCount++;
      };

      // Subscribe twice with ignoreDuplicate=false
      client.subscribe({ event: 'test-event', handler, ignoreDuplicate: false });
      client.subscribe({ event: 'test-event', handler, ignoreDuplicate: false });

      // Server sends event
      const clientSocket = Array.from(ioServer.sockets.sockets.values())[0];
      clientSocket.emit('test-event', {});

      await wait(100);

      // Should be called twice
      expect(callCount).toBe(2);

      client.shutdown();
    });

    test('should unsubscribe from events', async () => {
      let callCount = 0;

      const client = new SocketIOClientHelper({
        identifier: 'test-client',
        host: `http://localhost:${port}`,
        options: {
          path: '/io',
          extraHeaders: {},
        } as any,
      });

      await waitFor(() => client.getSocketClient().connected, { timeout: 3000 });

      client.subscribe({
        event: 'test-event',
        handler: () => {
          callCount++;
        },
      });

      client.unsubscribe({ event: 'test-event' });

      // Server sends event
      const clientSocket = Array.from(ioServer.sockets.sockets.values())[0];
      clientSocket.emit('test-event', {});

      await wait(100);

      // Handler should not be called
      expect(callCount).toBe(0);

      client.shutdown();
    });

    test('should handle subscribeMany for multiple events', async () => {
      const received: string[] = [];

      const client = new SocketIOClientHelper({
        identifier: 'test-client',
        host: `http://localhost:${port}`,
        options: {
          path: '/io',
          extraHeaders: {},
        } as any,
      });

      await waitFor(() => client.getSocketClient().connected, { timeout: 3000 });

      client.subscribeMany({
        events: {
          'event-a': () => {
            received.push('a');
          },
          'event-b': () => {
            received.push('b');
          },
          'event-c': () => {
            received.push('c');
          },
        },
      });

      const clientSocket = Array.from(ioServer.sockets.sockets.values())[0];
      clientSocket.emit('event-a', {});
      clientSocket.emit('event-b', {});
      clientSocket.emit('event-c', {});

      await wait(100);

      expect(received).toContain('a');
      expect(received).toContain('b');
      expect(received).toContain('c');

      client.shutdown();
    });

    test('should handle unsubscribeMany for multiple events', async () => {
      let callCount = 0;

      const client = new SocketIOClientHelper({
        identifier: 'test-client',
        host: `http://localhost:${port}`,
        options: {
          path: '/io',
          extraHeaders: {},
        } as any,
      });

      await waitFor(() => client.getSocketClient().connected, { timeout: 3000 });

      client.subscribeMany({
        events: {
          'event-a': () => {
            callCount++;
          },
          'event-b': () => {
            callCount++;
          },
        },
      });

      client.unsubscribeMany({ events: ['event-a', 'event-b'] });

      const clientSocket = Array.from(ioServer.sockets.sockets.values())[0];
      clientSocket.emit('event-a', {});
      clientSocket.emit('event-b', {});

      await wait(100);

      expect(callCount).toBe(0);

      client.shutdown();
    });
  });

  describe('Emit', () => {
    test('should emit events to server', async () => {
      let serverReceived: any = null;

      ioServer.on('connection', socket => {
        socket.on('client-message', data => {
          serverReceived = data;
        });
      });

      const client = new SocketIOClientHelper({
        identifier: 'test-client',
        host: `http://localhost:${port}`,
        options: {
          path: '/io',
          extraHeaders: {},
        } as any,
      });

      await waitFor(() => client.getSocketClient().connected, { timeout: 3000 });

      client.emit({
        topic: 'client-message',
        data: { content: 'Hello from client' },
      });

      await waitFor(() => serverReceived !== null, { timeout: 3000 });
      expect(serverReceived.content).toBe('Hello from client');

      client.shutdown();
    });

    test('should throw error when emitting without connection', () => {
      const client = new SocketIOClientHelper({
        identifier: 'test-client',
        host: `http://localhost:99999`,
        options: {
          path: '/io',
          extraHeaders: {},
        } as any,
      });

      expect(() => {
        client.emit({
          topic: 'test',
          data: {},
        });
      }).toThrow('Invalid socket client state to emit');

      client.shutdown();
    });

    test('should throw error when topic is empty', async () => {
      const client = new SocketIOClientHelper({
        identifier: 'test-client',
        host: `http://localhost:${port}`,
        options: {
          path: '/io',
          extraHeaders: {},
        } as any,
      });

      await waitFor(() => client.getSocketClient().connected, { timeout: 3000 });

      expect(() => {
        client.emit({
          topic: '',
          data: {},
        });
      }).toThrow('Topic is required to emit');

      client.shutdown();
    });

    test('should execute callback after emit', async () => {
      let didCallbackExecute = false;

      const client = new SocketIOClientHelper({
        identifier: 'test-client',
        host: `http://localhost:${port}`,
        options: {
          path: '/io',
          extraHeaders: {},
        } as any,
      });

      await waitFor(() => client.getSocketClient().connected, { timeout: 3000 });

      client.emit({
        topic: 'test',
        data: {},
        cb: () => {
          didCallbackExecute = true;
        },
      });

      await wait(50);
      expect(didCallbackExecute).toBe(true);

      client.shutdown();
    });
  });

  describe('Room Management', () => {
    test('should emit join event to server', async () => {
      let joinedRooms: string[] = [];

      ioServer.on('connection', socket => {
        socket.on(SocketIOConstants.EVENT_JOIN, (data: { rooms: string[] }) => {
          joinedRooms = data.rooms;
        });
      });

      const client = new SocketIOClientHelper({
        identifier: 'test-client',
        host: `http://localhost:${port}`,
        options: {
          path: '/io',
          extraHeaders: {},
        } as any,
      });

      await waitFor(() => client.getSocketClient().connected, { timeout: 3000 });

      client.joinRooms({ rooms: ['room-1', 'room-2'] });

      await waitFor(() => joinedRooms.length > 0, { timeout: 3000 });
      expect(joinedRooms).toContain('room-1');
      expect(joinedRooms).toContain('room-2');

      client.shutdown();
    });

    test('should emit leave event to server', async () => {
      let leftRooms: string[] = [];

      ioServer.on('connection', socket => {
        socket.on(SocketIOConstants.EVENT_LEAVE, (data: { rooms: string[] }) => {
          leftRooms = data.rooms;
        });
      });

      const client = new SocketIOClientHelper({
        identifier: 'test-client',
        host: `http://localhost:${port}`,
        options: {
          path: '/io',
          extraHeaders: {},
        } as any,
      });

      await waitFor(() => client.getSocketClient().connected, { timeout: 3000 });

      client.leaveRooms({ rooms: ['room-1'] });

      await waitFor(() => leftRooms.length > 0, { timeout: 3000 });
      expect(leftRooms).toContain('room-1');

      client.shutdown();
    });

    test('should not emit join when not connected', () => {
      const client = new SocketIOClientHelper({
        identifier: 'test-client',
        host: `http://localhost:99999`,
        options: {
          path: '/io',
          extraHeaders: {},
        } as any,
      });

      // Should not throw, just log warning
      client.joinRooms({ rooms: ['room-1'] });

      client.shutdown();
    });

    test('should not emit leave when not connected', () => {
      const client = new SocketIOClientHelper({
        identifier: 'test-client',
        host: `http://localhost:99999`,
        options: {
          path: '/io',
          extraHeaders: {},
        } as any,
      });

      // Should not throw, just log warning
      client.leaveRooms({ rooms: ['room-1'] });

      client.shutdown();
    });
  });

  describe('Shutdown', () => {
    test('should disconnect on shutdown', async () => {
      const client = new SocketIOClientHelper({
        identifier: 'test-client',
        host: `http://localhost:${port}`,
        options: {
          path: '/io',
          extraHeaders: {},
        } as any,
      });

      await waitFor(() => client.getSocketClient().connected, { timeout: 3000 });

      client.shutdown();

      expect(client.getSocketClient().connected).toBe(false);
    });

    test('should reset state to UNAUTHORIZED on shutdown', async () => {
      ioServer.on('connection', socket => {
        socket.on(SocketIOConstants.EVENT_AUTHENTICATE, () => {
          socket.emit(SocketIOConstants.EVENT_AUTHENTICATED, { id: socket.id });
        });
      });

      const client = new SocketIOClientHelper({
        identifier: 'test-client',
        host: `http://localhost:${port}`,
        options: {
          path: '/io',
          extraHeaders: {},
        } as any,
      });

      await waitFor(() => client.getSocketClient().connected, { timeout: 3000 });

      client.authenticate();

      await waitFor(() => client.getState() === SocketIOClientStates.AUTHENTICATED, {
        timeout: 3000,
      });

      client.shutdown();

      expect(client.getState()).toBe(SocketIOClientStates.UNAUTHORIZED);
    });

    test('should remove all listeners on shutdown', async () => {
      const client = new SocketIOClientHelper({
        identifier: 'test-client',
        host: `http://localhost:${port}`,
        options: {
          path: '/io',
          extraHeaders: {},
        } as any,
      });

      await waitFor(() => client.getSocketClient().connected, { timeout: 3000 });

      // Add some listeners
      client.subscribe({ event: 'test-1', handler: () => {} });
      client.subscribe({ event: 'test-2', handler: () => {} });

      client.shutdown();

      // Socket should have no custom listeners
      expect(client.getSocketClient().hasListeners('test-1')).toBe(false);
      expect(client.getSocketClient().hasListeners('test-2')).toBe(false);
    });
  });

  describe('Ping Handling', () => {
    test('should receive ping events from server', async () => {
      let didReceivePing = false;

      const client = new SocketIOClientHelper({
        identifier: 'test-client',
        host: `http://localhost:${port}`,
        options: {
          path: '/io',
          extraHeaders: {},
        } as any,
      });

      await waitFor(() => client.getSocketClient().connected, { timeout: 3000 });

      client.subscribe({
        event: SocketIOConstants.EVENT_PING,
        handler: () => {
          didReceivePing = true;
        },
        ignoreDuplicate: false,
      });

      // Server sends ping
      const clientSocket = Array.from(ioServer.sockets.sockets.values())[0];
      clientSocket.emit(SocketIOConstants.EVENT_PING, { time: new Date().toISOString() });

      await waitFor(() => didReceivePing, { timeout: 3000 });
      expect(didReceivePing).toBe(true);

      client.shutdown();
    });
  });

  describe('Error Handling', () => {
    test('should call onError callback on connection error', async () => {
      let errorReceived: Error | null = null;

      // Use invalid port that will cause connection error
      const client = new SocketIOClientHelper({
        identifier: 'test-client',
        host: 'http://localhost:99999',
        options: {
          path: '/io',
          extraHeaders: {},
          reconnection: false,
        } as any,
        onError: error => {
          errorReceived = error;
        },
      });

      await waitFor(() => errorReceived !== null, { timeout: 5000 });
      expect(errorReceived).toBeInstanceOf(Error);

      client.shutdown();
    });

    test('should handle handler errors gracefully', async () => {
      const client = new SocketIOClientHelper({
        identifier: 'test-client',
        host: `http://localhost:${port}`,
        options: {
          path: '/io',
          extraHeaders: {},
        } as any,
      });

      await waitFor(() => client.getSocketClient().connected, { timeout: 3000 });

      // Subscribe with handler that throws
      client.subscribe({
        event: 'error-event',
        handler: () => {
          throw new Error('Handler error');
        },
      });

      // Server sends event - should not crash
      const clientSocket = Array.from(ioServer.sockets.sockets.values())[0];
      clientSocket.emit('error-event', {});

      await wait(100);

      // Client should still be connected
      expect(client.getSocketClient().connected).toBe(true);

      client.shutdown();
    });

    test('should handle async handler errors gracefully', async () => {
      const client = new SocketIOClientHelper({
        identifier: 'test-client',
        host: `http://localhost:${port}`,
        options: {
          path: '/io',
          extraHeaders: {},
        } as any,
      });

      await waitFor(() => client.getSocketClient().connected, { timeout: 3000 });

      // Subscribe with async handler that rejects
      client.subscribe({
        event: 'async-error-event',
        handler: async () => {
          throw new Error('Async handler error');
        },
      });

      // Server sends event - should not crash
      const clientSocket = Array.from(ioServer.sockets.sockets.values())[0];
      clientSocket.emit('async-error-event', {});

      await wait(100);

      // Client should still be connected
      expect(client.getSocketClient().connected).toBe(true);

      client.shutdown();
    });
  });

  describe('Connect/Disconnect Methods', () => {
    test('should connect manually', async () => {
      const client = new SocketIOClientHelper({
        identifier: 'test-client',
        host: `http://localhost:${port}`,
        options: {
          path: '/io',
          extraHeaders: {},
          autoConnect: false,
        } as any,
      });

      expect(client.getSocketClient().connected).toBe(false);

      client.connect();

      await waitFor(() => client.getSocketClient().connected, { timeout: 3000 });
      expect(client.getSocketClient().connected).toBe(true);

      client.shutdown();
    });

    test('should disconnect manually', async () => {
      const client = new SocketIOClientHelper({
        identifier: 'test-client',
        host: `http://localhost:${port}`,
        options: {
          path: '/io',
          extraHeaders: {},
        } as any,
      });

      await waitFor(() => client.getSocketClient().connected, { timeout: 3000 });

      client.disconnect();

      await waitFor(() => !client.getSocketClient().connected, { timeout: 3000 });
      expect(client.getSocketClient().connected).toBe(false);

      client.shutdown();
    });
  });
});

// =============================================================================
// Edge Cases & Stress Tests
// =============================================================================

describe('SocketIOClientHelper - Edge Cases', () => {
  let httpServer: HTTPServer;
  let ioServer: IOServer;
  let port: number;
  let activeClients: SocketIOClientHelper[] = [];

  beforeEach(async () => {
    activeClients = [];
    port = await getAvailablePort();
    httpServer = createServer();

    await new Promise<void>(resolve => {
      httpServer.listen(port, () => resolve());
    });

    ioServer = new IOServer(httpServer, {
      path: '/io',
      cors: { origin: '*' },
    });
  });

  afterEach(async () => {
    // Cleanup all active clients first
    for (const client of activeClients) {
      try {
        client.shutdown();
      } catch {
        // Ignore errors during cleanup
      }
    }
    activeClients = [];

    // Close socket.io server
    try {
      ioServer.close();
    } catch {
      // Ignore errors
    }

    // Close HTTP server with timeout
    await Promise.race([
      new Promise<void>(resolve => {
        httpServer.close(() => resolve());
      }),
      wait(1000).then(() => {}), // Timeout after 1 second
    ]);
  });

  test('should handle rapid connect/disconnect cycles', async () => {
    for (let i = 0; i < 5; i++) {
      const client = new SocketIOClientHelper({
        identifier: `test-client-${i}`,
        host: `http://localhost:${port}`,
        options: {
          path: '/io',
          extraHeaders: {},
        } as any,
      });

      await waitFor(() => client.getSocketClient().connected, { timeout: 5000 });
      client.shutdown();
      // Wait for server-side disconnect to propagate
      await waitFor(() => ioServer.sockets.sockets.size === 0, { timeout: 5000 });
    }

    // All clients should be disconnected
    expect(ioServer.sockets.sockets.size).toBe(0);
  });

  test('should handle multiple clients simultaneously', async () => {
    const clients: SocketIOClientHelper[] = [];
    const clientCount = 10;

    for (let i = 0; i < clientCount; i++) {
      const client = new SocketIOClientHelper({
        identifier: `client-${i}`,
        host: `http://localhost:${port}`,
        options: {
          path: '/io',
          extraHeaders: {},
        } as any,
      });
      clients.push(client);
    }

    await waitFor(() => clients.every(c => c.getSocketClient().connected), { timeout: 5000 });

    expect(ioServer.sockets.sockets.size).toBe(clientCount);

    // Cleanup
    clients.forEach(c => c.shutdown());
  });

  test('should handle receiving messages with empty/null handlers gracefully', async () => {
    const client = new SocketIOClientHelper({
      identifier: 'test-client',
      host: `http://localhost:${port}`,
      options: {
        path: '/io',
        extraHeaders: {},
      } as any,
    });

    await waitFor(() => client.getSocketClient().connected, { timeout: 3000 });

    // Try to subscribe with no handler
    client.subscribe({
      event: 'test-event',
      handler: null as any,
    });

    // Should not crash
    const clientSocket = Array.from(ioServer.sockets.sockets.values())[0];
    clientSocket.emit('test-event', {});

    await wait(50);
    expect(client.getSocketClient().connected).toBe(true);

    client.shutdown();
  });

  test('should handle unsubscribe for non-existent event', async () => {
    const client = new SocketIOClientHelper({
      identifier: 'test-client',
      host: `http://localhost:${port}`,
      options: {
        path: '/io',
        extraHeaders: {},
      } as any,
    });

    await waitFor(() => client.getSocketClient().connected, { timeout: 3000 });

    // Should not throw
    client.unsubscribe({ event: 'non-existent-event' });

    expect(client.getSocketClient().connected).toBe(true);

    client.shutdown();
  });
});
