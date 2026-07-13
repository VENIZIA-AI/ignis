/**
 * SocketIOClientHelper Test Suite.
 *
 * The client is driven against a real socket.io server bound to port 0 (the server helper itself
 * needs Redis, so a bare IOServer stands in for it and speaks the same authenticate protocol).
 */

import type { AnyType } from '@/common/types';
import {
  IOptions,
  SocketIOClientHelper,
  SocketIOClientStates,
  SocketIOConstants,
} from '@/modules/socket/socket-io';
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { createServer, Server as HTTPServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Server as IOServer, Socket as IOSocket } from 'socket.io';

const AUTHENTICATED_USER = 'user-a';

let httpServer: HTTPServer;
let ioServer: IOServer;
let host: string;
let serverSockets: IOSocket[] = [];
let received: Array<{ topic: string; payload: unknown }> = [];
let shouldAuthenticate = true;

const clients: SocketIOClientHelper[] = [];

const createClient = (opts?: {
  onConnected?: () => void;
  onDisconnected?: (reason: string) => void;
  onAuthenticated?: () => void;
  onUnauthenticated?: (message: string) => void;
  onError?: (error: Error) => void;
  autoConnect?: boolean;
  host?: string;
}) => {
  const client = new SocketIOClientHelper({
    identifier: 'test-io-client',
    host: opts?.host ?? host,
    options: {
      transports: ['polling'],
      autoConnect: opts?.autoConnect ?? true,
      reconnection: false,
      extraHeaders: {},
    } as AnyType as IOptions,
    onConnected: opts?.onConnected,
    onDisconnected: opts?.onDisconnected,
    onAuthenticated: opts?.onAuthenticated,
    onUnauthenticated: opts?.onUnauthenticated,
    onError: opts?.onError,
  });

  clients.push(client);
  return client;
};

const waitFor = (predicate: () => boolean, opts?: { timeout?: number }) => {
  const timeout = opts?.timeout ?? 3_000;
  const deadline = Date.now() + timeout;

  return new Promise<void>((resolve, reject) => {
    const poll = () => {
      if (predicate()) {
        resolve();
        return;
      }

      if (Date.now() > deadline) {
        reject(new Error('waitFor timed out'));
        return;
      }

      setTimeout(poll, 5);
    };

    poll();
  });
};

beforeEach(async () => {
  serverSockets = [];
  received = [];
  shouldAuthenticate = true;

  httpServer = createServer();
  await new Promise<void>(resolve => {
    httpServer.listen(0, '127.0.0.1', () => {
      resolve();
    });
  });

  const { port } = httpServer.address() as AddressInfo;
  host = `http://127.0.0.1:${port}`;

  ioServer = new IOServer(httpServer);
  ioServer.on(SocketIOConstants.EVENT_CONNECT, (socket: IOSocket) => {
    serverSockets.push(socket);

    socket.onAny((topic: string, payload: unknown) => {
      received.push({ topic, payload });
    });

    socket.on(SocketIOConstants.EVENT_AUTHENTICATE, () => {
      if (!shouldAuthenticate) {
        socket.emit(SocketIOConstants.EVENT_UNAUTHENTICATE, { message: 'Invalid token!' });
        return;
      }

      socket.emit(SocketIOConstants.EVENT_AUTHENTICATED, {
        id: socket.id,
        user: AUTHENTICATED_USER,
      });
    });
  });
});

afterEach(async () => {
  while (clients.length) {
    clients.pop()?.shutdown();
  }

  await ioServer.close();
  await new Promise<void>(resolve => {
    httpServer.close(() => {
      resolve();
    });
  });
});

describe('SocketIOClientHelper | connection', () => {
  test('connects and invokes onConnected', async () => {
    const onConnected = mock(() => {});
    const client = createClient({ onConnected });

    await waitFor(() => client.getSocketClient().connected);

    expect(onConnected).toHaveBeenCalledTimes(1);
    expect(client.getState()).toBe(SocketIOClientStates.UNAUTHORIZED);
  });

  test('does not connect when autoConnect is false, and connect() opens it', async () => {
    const client = createClient({ autoConnect: false });
    expect(client.getSocketClient().connected).toBe(false);

    client.connect();
    await waitFor(() => client.getSocketClient().connected);

    expect(client.getSocketClient().connected).toBe(true);
  });

  test('disconnect() invokes onDisconnected and resets the state', async () => {
    const onDisconnected = mock(() => {});
    const client = createClient({ onDisconnected });
    await waitFor(() => client.getSocketClient().connected);

    client.disconnect();
    await waitFor(() => onDisconnected.mock.calls.length > 0);

    expect(client.getState()).toBe(SocketIOClientStates.UNAUTHORIZED);
  });

  test('invokes onError when the host is unreachable', async () => {
    const onError = mock(() => {});
    createClient({ onError, host: 'http://127.0.0.1:1' });

    await waitFor(() => onError.mock.calls.length > 0);

    expect(onError).toHaveBeenCalled();
  });

  test('configure() is idempotent — a second call keeps the same socket', async () => {
    const client = createClient();
    const socket = client.getSocketClient();

    client.configure();

    expect(client.getSocketClient()).toBe(socket);
  });
});

describe('SocketIOClientHelper | authentication', () => {
  test('authenticate() drives the state to AUTHENTICATED', async () => {
    const onAuthenticated = mock(() => {});
    const client = createClient({ onAuthenticated });
    await waitFor(() => client.getSocketClient().connected);

    client.authenticate();
    expect(client.getState()).toBe(SocketIOClientStates.AUTHENTICATING);

    await waitFor(() => onAuthenticated.mock.calls.length > 0);
    expect(client.getState()).toBe(SocketIOClientStates.AUTHENTICATED);
  });

  test('a rejected authentication drives the state back to UNAUTHORIZED', async () => {
    shouldAuthenticate = false;
    const onUnauthenticated = mock((_message: string) => {});
    const client = createClient({ onUnauthenticated });
    await waitFor(() => client.getSocketClient().connected);

    client.authenticate();
    await waitFor(() => onUnauthenticated.mock.calls.length > 0);

    expect(onUnauthenticated).toHaveBeenCalledWith('Invalid token!');
    expect(client.getState()).toBe(SocketIOClientStates.UNAUTHORIZED);
  });

  test('authenticate() is a no-op when not connected', () => {
    const client = createClient({ autoConnect: false });

    client.authenticate();

    expect(client.getState()).toBe(SocketIOClientStates.UNAUTHORIZED);
  });

  test('authenticate() is a no-op when already authenticating', async () => {
    const client = createClient();
    await waitFor(() => client.getSocketClient().connected);

    client.authenticate();
    client.authenticate();
    await waitFor(() => client.getState() === SocketIOClientStates.AUTHENTICATED);

    const authenticateRequests = received.filter(
      entry => entry.topic === SocketIOConstants.EVENT_AUTHENTICATE,
    );
    expect(authenticateRequests).toHaveLength(1);
  });
});

describe('SocketIOClientHelper | emit', () => {
  test('emits to the server and invokes the callback', async () => {
    const client = createClient();
    await waitFor(() => client.getSocketClient().connected);
    const callback = mock(() => {});

    client.emit({ topic: 'a-topic', data: { value: 1 }, callback: callback });

    await waitFor(() => received.some(entry => entry.topic === 'a-topic'));
    expect(received.find(entry => entry.topic === 'a-topic')?.payload).toEqual({ value: 1 });
    expect(callback).toHaveBeenCalledTimes(1);
  });

  test('throws when the client is not connected', () => {
    const client = createClient({ autoConnect: false });

    expect(() => client.emit({ topic: 'a-topic', data: {} })).toThrow(
      /Invalid socket client state to emit/,
    );
  });

  test('throws when the topic is empty', async () => {
    const client = createClient();
    await waitFor(() => client.getSocketClient().connected);

    expect(() => client.emit({ topic: '', data: {} })).toThrow(/Topic is required/);
  });

  test('joinRooms and leaveRooms emit the room payload', async () => {
    const client = createClient();
    await waitFor(() => client.getSocketClient().connected);

    client.joinRooms({ rooms: ['room-a'] });
    client.leaveRooms({ rooms: ['room-a'] });

    await waitFor(() => received.some(entry => entry.topic === SocketIOConstants.EVENT_LEAVE));
    expect(received.find(entry => entry.topic === SocketIOConstants.EVENT_JOIN)?.payload).toEqual({
      rooms: ['room-a'],
    });
    expect(received.find(entry => entry.topic === SocketIOConstants.EVENT_LEAVE)?.payload).toEqual({
      rooms: ['room-a'],
    });
  });

  test('joinRooms is a no-op when not connected', () => {
    const client = createClient({ autoConnect: false });

    expect(() => client.joinRooms({ rooms: ['room-a'] })).not.toThrow();
    expect(() => client.leaveRooms({ rooms: ['room-a'] })).not.toThrow();
  });
});

describe('SocketIOClientHelper | subscriptions', () => {
  test('receives server events through a subscribed handler', async () => {
    const client = createClient();
    await waitFor(() => client.getSocketClient().connected);

    const handler = mock((_data: unknown) => {});
    client.subscribe({ event: 'a-topic', handler });

    serverSockets[0].emit('a-topic', { value: 1 });
    await waitFor(() => handler.mock.calls.length > 0);

    expect(handler).toHaveBeenCalledWith({ value: 1 });
  });

  test('a synchronously throwing handler does not escape the socket listener', async () => {
    const client = createClient();
    await waitFor(() => client.getSocketClient().connected);

    const survivor = mock((_data: unknown) => {});
    client.subscribe({
      event: 'boom-topic',
      handler: () => {
        throw new Error('sync subscribe handler boom');
      },
    });
    client.subscribe({ event: 'a-topic', handler: survivor });

    serverSockets[0].emit('boom-topic', { value: 1 });
    serverSockets[0].emit('a-topic', { value: 2 });

    await waitFor(() => survivor.mock.calls.length > 0);
    expect(survivor).toHaveBeenCalledWith({ value: 2 });
  });

  test('subscribeMany registers every handler', async () => {
    const client = createClient();
    await waitFor(() => client.getSocketClient().connected);

    const first = mock((_data: unknown) => {});
    const second = mock((_data: unknown) => {});
    client.subscribeMany({ events: { 'topic-a': first, 'topic-b': second } });

    serverSockets[0].emit('topic-a', { value: 1 });
    serverSockets[0].emit('topic-b', { value: 2 });

    await waitFor(() => first.mock.calls.length > 0 && second.mock.calls.length > 0);
    expect(first).toHaveBeenCalledWith({ value: 1 });
    expect(second).toHaveBeenCalledWith({ value: 2 });
  });

  test('subscribe skips a duplicate event by default', async () => {
    const client = createClient();
    await waitFor(() => client.getSocketClient().connected);

    const first = mock((_data: unknown) => {});
    const second = mock((_data: unknown) => {});
    client.subscribe({ event: 'a-topic', handler: first });
    client.subscribe({ event: 'a-topic', handler: second });

    serverSockets[0].emit('a-topic', { value: 1 });
    await waitFor(() => first.mock.calls.length > 0);

    expect(second).not.toHaveBeenCalled();
  });

  test('unsubscribe({ event, handler }) removes that exact handler', async () => {
    const client = createClient();
    await waitFor(() => client.getSocketClient().connected);

    const handler = mock((_data: unknown) => {});
    client.subscribe({ event: 'a-topic', handler });
    expect(client.getSocketClient().hasListeners('a-topic')).toBe(true);

    client.unsubscribe({ event: 'a-topic', handler });

    expect(client.getSocketClient().hasListeners('a-topic')).toBe(false);

    serverSockets[0].emit('a-topic', { value: 1 });
    await new Promise<void>(resolve => setTimeout(resolve, 50));
    expect(handler).not.toHaveBeenCalled();
  });

  test('unsubscribe({ event }) removes every handler for the event', async () => {
    const client = createClient();
    await waitFor(() => client.getSocketClient().connected);

    const handler = mock((_data: unknown) => {});
    client.subscribe({ event: 'a-topic', handler });
    client.unsubscribe({ event: 'a-topic' });

    expect(client.getSocketClient().hasListeners('a-topic')).toBe(false);
  });

  test('unsubscribeMany removes every listed event', async () => {
    const client = createClient();
    await waitFor(() => client.getSocketClient().connected);

    client.subscribe({ event: 'topic-a', handler: () => {} });
    client.subscribe({ event: 'topic-b', handler: () => {} });

    client.unsubscribeMany({ events: ['topic-a', 'topic-b'] });

    expect(client.getSocketClient().hasListeners('topic-a')).toBe(false);
    expect(client.getSocketClient().hasListeners('topic-b')).toBe(false);
  });

  test('resubscribing after unsubscribe works (handler registry does not leak)', async () => {
    const client = createClient();
    await waitFor(() => client.getSocketClient().connected);

    const handler = mock((_data: unknown) => {});
    client.subscribe({ event: 'a-topic', handler });
    client.unsubscribe({ event: 'a-topic', handler });
    client.subscribe({ event: 'a-topic', handler });

    serverSockets[0].emit('a-topic', { value: 1 });
    await waitFor(() => handler.mock.calls.length > 0);

    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe('SocketIOClientHelper | shutdown', () => {
  test('removes every listener, disconnects and resets the state', async () => {
    const client = createClient();
    await waitFor(() => client.getSocketClient().connected);

    const handler = mock((_data: unknown) => {});
    client.subscribe({ event: 'a-topic', handler });

    client.shutdown();

    expect(client.getSocketClient().connected).toBe(false);
    expect(client.getSocketClient().hasListeners('a-topic')).toBe(false);
    expect(client.getState()).toBe(SocketIOClientStates.UNAUTHORIZED);
  });

  test('is safe to call twice', async () => {
    const client = createClient();
    await waitFor(() => client.getSocketClient().connected);

    client.shutdown();
    expect(() => client.shutdown()).not.toThrow();
  });
});
