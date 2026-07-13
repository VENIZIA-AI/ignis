/** SocketIOServerHelper Test Suite */

import { RuntimeModules } from '@/common/constants';
import type { AnyType } from '@/common/types';
import { getError } from '@/modules/error';
import type { IRedisHelper } from '@/modules/redis';
import {
  ISocketIOClient,
  SocketIOClientStates,
  SocketIOConstants,
  SocketIOServerHelper,
  TSocketIOServerOptions,
} from '@/modules/socket/socket-io';
import { afterEach, describe, expect, mock, test } from 'bun:test';
import { EventEmitter } from 'node:events';
import type { Server as HTTPServer } from 'node:http';
import type { Socket as IOSocket } from 'socket.io';

const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
const flush = () => new Promise<void>(resolve => setImmediate(resolve));

class MockRedisClient extends EventEmitter {
  status = 'ready';
  quit = mock(() => Promise.resolve('OK'));
  connect = mock(() => Promise.resolve());
}

const createMockRedisHelper = () => {
  const clients: MockRedisClient[] = [];

  const helper = {
    duplicateClient: () => {
      const client = new MockRedisClient();
      clients.push(client);
      return client;
    },
  } as AnyType as IRedisHelper;

  return { helper, clients };
};

/** Socket.IO sockets are EventEmitters; the fake records outbound emits while still dispatching inbound ones. */
const createMockSocket = (id: string) => {
  const emitted: Array<{ topic: string; args: unknown[] }> = [];
  const socket: AnyType = new EventEmitter();

  socket.id = id;
  socket.emitted = emitted;
  socket.handshake = {
    headers: {},
    time: new Date().toISOString(),
    address: '127.0.0.1',
    xdomain: false,
    secure: false,
    issued: Date.now(),
    url: '/socket.io',
    query: {},
    auth: { token: 'test-token' },
  };
  socket.join = mock(() => Promise.resolve());
  socket.leave = mock(() => Promise.resolve());
  socket.disconnect = mock(() => socket);

  const originalEmit = socket.emit.bind(socket);
  socket.emit = (topic: string, ...args: unknown[]) => {
    emitted.push({ topic, args });
    return originalEmit(topic, ...args);
  };

  return socket as IOSocket & {
    emitted: typeof emitted;
    join: ReturnType<typeof mock>;
    leave: ReturnType<typeof mock>;
    disconnect: ReturnType<typeof mock>;
  };
};

/** Stand-in for the Redis-backed @socket.io/redis-emitter used by send(). */
const createMockEmitter = () => {
  const sent: Array<{ destination?: string; topic: string; data: unknown }> = [];
  let destination: string | undefined;

  const target = {
    to: (value: string) => {
      destination = value;
      return target;
    },
    emit: (topic: string, data: unknown) => {
      sent.push({ destination, topic, data });
      destination = undefined;
      return true;
    },
  };

  return {
    sent,
    emitter: { compress: () => target },
  };
};

const createMockIOServer = () => {
  const closed: Array<() => void> = [];

  return {
    closed,
    io: {
      on: mock(() => {}),
      adapter: mock(() => {}),
      close: mock((callback?: (error?: Error) => void) => {
        closed.push(() => {});
        callback?.();
      }),
    },
  };
};

const helpers: SocketIOServerHelper[] = [];

const createHelper = (opts?: Partial<TSocketIOServerOptions>) => {
  const { helper: redisConnection, clients } = createMockRedisHelper();
  const { emitter, sent } = createMockEmitter();
  const { io } = createMockIOServer();

  const helper = new SocketIOServerHelper({
    identifier: 'test-io-server',
    runtime: RuntimeModules.NODE,
    server: {} as AnyType as HTTPServer,
    serverOptions: {},
    redisConnection,
    authenticateFn: () => true,
    ...opts,
  } as TSocketIOServerOptions);

  helper['io'] = io as AnyType;
  helper['emitter'] = emitter as AnyType;

  helpers.push(helper);
  return { helper, io, sent, redisClients: clients };
};

const authenticate = async (opts: { socket: IOSocket }) => {
  opts.socket.emit(SocketIOConstants.EVENT_AUTHENTICATE);
  await flush();
  await flush();
};

afterEach(async () => {
  while (helpers.length) {
    const helper = helpers.pop();
    await helper?.shutdown();
  }
});

describe('SocketIOServerHelper | constructor', () => {
  test('rejects a NODE runtime without an HTTP server', () => {
    expect(() =>
      createHelper({ runtime: RuntimeModules.NODE, server: undefined as AnyType as HTTPServer }),
    ).toThrow(/Invalid HTTP server/);
  });

  test('rejects a BUN runtime without an engine', () => {
    expect(() =>
      createHelper({ runtime: RuntimeModules.BUN, engine: undefined } as AnyType),
    ).toThrow(/Invalid @socket.io\/bun-engine/);
  });

  test('rejects an unsupported runtime', () => {
    expect(() => createHelper({ runtime: 'deno' } as AnyType)).toThrow(/Unsupported runtime/);
  });

  test('rejects a missing redis connection', () => {
    expect(() => createHelper({ redisConnection: undefined as AnyType as IRedisHelper })).toThrow(
      /Invalid redis connection/,
    );
  });

  test('duplicates one redis client per adapter role (pub, sub, emitter)', () => {
    const { redisClients } = createHelper();
    expect(redisClients).toHaveLength(3);
  });

  test('applies default timeouts and rooms', () => {
    const { helper } = createHelper();

    expect(helper['authenticateTimeout']).toBe(10_000);
    expect(helper['pingInterval']).toBe(30_000);
    expect(helper['defaultRooms']).toEqual([
      SocketIOConstants.ROOM_DEFAULT,
      SocketIOConstants.ROOM_NOTIFICATION,
    ]);
  });

  test('honours custom timeouts and rooms', () => {
    const { helper } = createHelper({
      authenticateTimeout: 50,
      pingInterval: 60,
      defaultRooms: ['room-a'],
    });

    expect(helper['authenticateTimeout']).toBe(50);
    expect(helper['pingInterval']).toBe(60);
    expect(helper['defaultRooms']).toEqual(['room-a']);
  });

  test('getEngine() is only valid for the BUN runtime', () => {
    const { helper } = createHelper();
    expect(() => helper.getEngine()).toThrow(/only available for Bun runtime/);
  });
});

describe('SocketIOServerHelper | on', () => {
  test('rejects an empty topic or a missing handler', () => {
    const { helper } = createHelper();

    expect(() => helper.on({ topic: '', handler: () => {} })).toThrow(/Invalid topic/);
    expect(() =>
      helper.on({ topic: 'a-topic', handler: undefined as AnyType as () => void }),
    ).toThrow(/Invalid event handler/);
  });

  test('rejects binding before the IO server is initialized', () => {
    const { helper } = createHelper();
    helper['io'] = undefined as AnyType;

    expect(() => helper.on({ topic: 'a-topic', handler: () => {} })).toThrow(
      /IOServer is not initialized/,
    );
  });

  test('binds the handler on the IO server', () => {
    const { helper, io } = createHelper();
    const handler = () => {};

    helper.on({ topic: 'a-topic', handler });

    expect(io.on).toHaveBeenCalledWith('a-topic', handler);
  });
});

describe('SocketIOServerHelper | connection lifecycle', () => {
  test('registers a new client as UNAUTHORIZED', () => {
    const { helper } = createHelper();
    const socket = createMockSocket('client-a');

    helper.onClientConnect({ socket });

    const client = helper.getClients({ id: 'client-a' }) as ISocketIOClient;
    expect(client.state).toBe(SocketIOClientStates.UNAUTHORIZED);
    expect(client.authenticateTimeout).toBeDefined();
  });

  test('ignores a duplicate connection for the same socket id', () => {
    const { helper } = createHelper();
    const socket = createMockSocket('client-a');

    helper.onClientConnect({ socket });
    helper.onClientConnect({ socket });

    expect((helper.getClients() as Map<string, ISocketIOClient>).size).toBe(1);
  });

  test('disconnects the client when the authenticate timeout elapses', async () => {
    const { helper } = createHelper({ authenticateTimeout: 20 });
    const socket = createMockSocket('client-a');

    helper.onClientConnect({ socket });
    await wait(50);

    expect(socket.disconnect).toHaveBeenCalledTimes(1);
    expect(helper.getClients({ id: 'client-a' })).toBeUndefined();
  });

  test('disconnect() clears the registry entry and the armed timers', () => {
    const { helper } = createHelper();
    const socket = createMockSocket('client-a');

    helper.onClientConnect({ socket });
    helper.disconnect({ socket });

    expect(helper.getClients({ id: 'client-a' })).toBeUndefined();
    expect(socket.disconnect).toHaveBeenCalledTimes(1);
  });

  test('a client dropping mid-authentication does not leave the auth timer armed', async () => {
    const { helper } = createHelper({
      authenticateTimeout: 20,
      authenticateFn: () => new Promise<boolean>(() => {}),
    });
    const socket = createMockSocket('client-a');

    helper.onClientConnect({ socket });
    socket.emit(SocketIOConstants.EVENT_AUTHENTICATE);
    socket.emit(SocketIOConstants.EVENT_DISCONNECT);

    expect(helper.getClients({ id: 'client-a' })).toBeUndefined();

    socket.disconnect.mockClear();
    await wait(50);
    expect(socket.disconnect).not.toHaveBeenCalled();
  });

  test('repeated connect/disconnect cycles do not grow the client registry', () => {
    const { helper } = createHelper();

    for (let index = 0; index < 25; index++) {
      const socket = createMockSocket(`client-${index}`);
      helper.onClientConnect({ socket });
      socket.emit(SocketIOConstants.EVENT_DISCONNECT);
    }

    expect((helper.getClients() as Map<string, ISocketIOClient>).size).toBe(0);
  });
});

describe('SocketIOServerHelper | authentication', () => {
  test('authenticates a client, joins the default rooms and emits AUTHENTICATED', async () => {
    const { helper, sent } = createHelper({ pingInterval: 10_000 });
    const socket = createMockSocket('client-a');

    helper.onClientConnect({ socket });
    await authenticate({ socket });

    const client = helper.getClients({ id: 'client-a' }) as ISocketIOClient;
    expect(client.state).toBe(SocketIOClientStates.AUTHENTICATED);
    expect(socket.join).toHaveBeenCalledTimes(2);
    expect(sent.map(entry => entry.topic)).toContain(SocketIOConstants.EVENT_AUTHENTICATED);
  });

  test('passes the handshake to authenticateFn', async () => {
    const authenticateFn = mock(() => true);
    const { helper } = createHelper({ authenticateFn });
    const socket = createMockSocket('client-a');

    helper.onClientConnect({ socket });
    await authenticate({ socket });

    expect(authenticateFn).toHaveBeenCalledWith(socket.handshake as AnyType);
  });

  test('clears the authenticate timeout once the client is authenticated', async () => {
    const { helper } = createHelper({ authenticateTimeout: 20 });
    const socket = createMockSocket('client-a');

    helper.onClientConnect({ socket });
    await authenticate({ socket });

    const client = helper.getClients({ id: 'client-a' }) as ISocketIOClient;
    expect(client.authenticateTimeout).toBeUndefined();

    await wait(50);
    expect(socket.disconnect).not.toHaveBeenCalled();
    expect(helper.getClients({ id: 'client-a' })).toBeDefined();
  });

  test('starts the ping interval after authentication and clears it on disconnect', async () => {
    const { helper } = createHelper({ pingInterval: 20 });
    const socket = createMockSocket('client-a');

    helper.onClientConnect({ socket });
    await authenticate({ socket });
    await wait(50);

    const pings = socket.emitted.filter(entry => entry.topic === SocketIOConstants.EVENT_PING);
    expect(pings.length).toBeGreaterThanOrEqual(2);

    helper.disconnect({ socket });
    const pingsAfterDisconnect = socket.emitted.filter(
      entry => entry.topic === SocketIOConstants.EVENT_PING,
    ).length;

    await wait(50);
    expect(
      socket.emitted.filter(entry => entry.topic === SocketIOConstants.EVENT_PING).length,
    ).toBe(pingsAfterDisconnect);
  });

  test('rejects the client when authenticateFn resolves false', async () => {
    const { helper, sent } = createHelper({ authenticateFn: () => false });
    const socket = createMockSocket('client-a');

    helper.onClientConnect({ socket });
    await authenticate({ socket });
    await flush();

    expect(sent.map(entry => entry.topic)).toContain(SocketIOConstants.EVENT_UNAUTHENTICATE);
    expect(socket.disconnect).toHaveBeenCalledTimes(1);
    expect(helper.getClients({ id: 'client-a' })).toBeUndefined();
  });

  test('rejects the client when authenticateFn rejects', async () => {
    const { helper, sent } = createHelper({
      authenticateFn: () => Promise.reject(getError({ message: 'async auth boom' })),
    });
    const socket = createMockSocket('client-a');

    helper.onClientConnect({ socket });
    await authenticate({ socket });
    await flush();

    expect(sent.map(entry => entry.topic)).toContain(SocketIOConstants.EVENT_UNAUTHENTICATE);
    expect(socket.disconnect).toHaveBeenCalledTimes(1);
  });

  test('a synchronously throwing authenticateFn does not escape the socket listener', async () => {
    const { helper, sent } = createHelper({
      authenticateFn: () => {
        throw getError({ message: 'sync auth boom' });
      },
    });
    const socket = createMockSocket('client-a');

    helper.onClientConnect({ socket });

    expect(() => socket.emit(SocketIOConstants.EVENT_AUTHENTICATE)).not.toThrow();

    await flush();
    await flush();
    expect(sent.map(entry => entry.topic)).toContain(SocketIOConstants.EVENT_UNAUTHENTICATE);
    expect(helper.getClients({ id: 'client-a' })).toBeUndefined();
  });

  test('ignores an authenticate request from an already authenticated client', async () => {
    const authenticateFn = mock(() => true);
    const { helper } = createHelper({ authenticateFn });
    const socket = createMockSocket('client-a');

    helper.onClientConnect({ socket });
    await authenticate({ socket });
    await authenticate({ socket });

    expect(authenticateFn).toHaveBeenCalledTimes(1);
  });

  test('invokes clientConnectedFn after authentication', async () => {
    const clientConnectedFn = mock(() => {});
    const { helper } = createHelper({ clientConnectedFn });
    const socket = createMockSocket('client-a');

    helper.onClientConnect({ socket });
    await authenticate({ socket });

    expect(clientConnectedFn).toHaveBeenCalledTimes(1);
  });

  test('a synchronously throwing clientConnectedFn does not drop the authenticated client', async () => {
    const { helper, sent } = createHelper({
      clientConnectedFn: () => {
        throw getError({ message: 'sync clientConnectedFn boom' });
      },
    });
    const socket = createMockSocket('client-a');

    helper.onClientConnect({ socket });
    await authenticate({ socket });
    await flush();

    const client = helper.getClients({ id: 'client-a' }) as ISocketIOClient;
    expect(client?.state).toBe(SocketIOClientStates.AUTHENTICATED);
    expect(socket.disconnect).not.toHaveBeenCalled();
    expect(sent.map(entry => entry.topic)).not.toContain(SocketIOConstants.EVENT_UNAUTHENTICATE);
  });

  test('a rejecting clientConnectedFn does not drop the authenticated client', async () => {
    const { helper } = createHelper({
      clientConnectedFn: () =>
        Promise.reject(getError({ message: 'async clientConnectedFn boom' })),
    });
    const socket = createMockSocket('client-a');

    helper.onClientConnect({ socket });
    await authenticate({ socket });
    await flush();

    const client = helper.getClients({ id: 'client-a' }) as ISocketIOClient;
    expect(client?.state).toBe(SocketIOClientStates.AUTHENTICATED);
    expect(socket.disconnect).not.toHaveBeenCalled();
  });
});

describe('SocketIOServerHelper | rooms', () => {
  test('joins the rooms returned by validateRoomFn', async () => {
    const validateRoomFn = mock(() => ['room-a']);
    const { helper } = createHelper({ validateRoomFn });
    const socket = createMockSocket('client-a');

    helper.onClientConnect({ socket });
    await authenticate({ socket });
    socket.join.mockClear();

    socket.emit(SocketIOConstants.EVENT_JOIN, { rooms: ['room-a', 'room-b'] });
    await flush();

    expect(validateRoomFn).toHaveBeenCalledTimes(1);
    expect(socket.join).toHaveBeenCalledWith('room-a');
    expect(socket.join).toHaveBeenCalledTimes(1);
  });

  test('rejects a join when no validateRoomFn is configured', async () => {
    const { helper } = createHelper();
    const socket = createMockSocket('client-a');

    helper.onClientConnect({ socket });
    await authenticate({ socket });
    socket.join.mockClear();

    socket.emit(SocketIOConstants.EVENT_JOIN, { rooms: ['room-a'] });
    await flush();

    expect(socket.join).not.toHaveBeenCalled();
  });

  test('ignores a join with no rooms', async () => {
    const validateRoomFn = mock(() => ['room-a']);
    const { helper } = createHelper({ validateRoomFn });
    const socket = createMockSocket('client-a');

    helper.onClientConnect({ socket });
    await authenticate({ socket });

    socket.emit(SocketIOConstants.EVENT_JOIN, { rooms: [] });
    await flush();

    expect(validateRoomFn).not.toHaveBeenCalled();
  });

  test('a synchronously throwing validateRoomFn does not escape the socket listener', async () => {
    const { helper } = createHelper({
      validateRoomFn: () => {
        throw getError({ message: 'sync validateRoomFn boom' });
      },
    });
    const socket = createMockSocket('client-a');

    helper.onClientConnect({ socket });
    await authenticate({ socket });

    expect(() => socket.emit(SocketIOConstants.EVENT_JOIN, { rooms: ['room-a'] })).not.toThrow();
  });

  test('a rejecting validateRoomFn does not escape the socket listener', async () => {
    const { helper } = createHelper({
      validateRoomFn: () => Promise.reject(getError({ message: 'async validateRoomFn boom' })),
    });
    const socket = createMockSocket('client-a');

    helper.onClientConnect({ socket });
    await authenticate({ socket });
    socket.join.mockClear();

    expect(() => socket.emit(SocketIOConstants.EVENT_JOIN, { rooms: ['room-a'] })).not.toThrow();
    await flush();
    expect(socket.join).not.toHaveBeenCalled();
  });

  test('leaves the requested rooms', async () => {
    const { helper } = createHelper();
    const socket = createMockSocket('client-a');

    helper.onClientConnect({ socket });
    await authenticate({ socket });

    socket.emit(SocketIOConstants.EVENT_LEAVE, { rooms: ['room-a'] });
    await flush();

    expect(socket.leave).toHaveBeenCalledWith('room-a');
  });
});

describe('SocketIOServerHelper | ping', () => {
  test('disconnects an unauthenticated client when auth is enforced', () => {
    const { helper } = createHelper();
    const socket = createMockSocket('client-a');
    helper.onClientConnect({ socket });

    helper.ping({ socket, doIgnoreAuth: false });

    expect(socket.disconnect).toHaveBeenCalledTimes(1);
  });

  test('is a no-op for an unknown client', () => {
    const { helper } = createHelper();
    const socket = createMockSocket('client-a');

    helper.ping({ socket, doIgnoreAuth: true });

    expect(socket.emitted).toHaveLength(0);
  });
});

describe('SocketIOServerHelper | send', () => {
  test('emits to a destination through the redis emitter', () => {
    const { helper, sent } = createHelper();

    helper.send({ destination: 'client-a', payload: { topic: 'a-topic', data: { value: 1 } } });

    expect(sent).toEqual([{ destination: 'client-a', topic: 'a-topic', data: { value: 1 } }]);
  });

  test('broadcasts when no destination is given', () => {
    const { helper, sent } = createHelper();

    helper.send({ payload: { topic: 'a-topic', data: { value: 1 } } });

    expect(sent).toEqual([{ destination: undefined, topic: 'a-topic', data: { value: 1 } }]);
  });

  test('ignores an empty payload', () => {
    const { helper, sent } = createHelper();

    helper.send({ payload: undefined as AnyType as { topic: string; data: unknown } });
    helper.send({ payload: { topic: '', data: { value: 1 } } });

    expect(sent).toHaveLength(0);
  });

  test('invokes the callback after emitting', async () => {
    const { helper } = createHelper();
    const callback = mock(() => {});

    helper.send({ payload: { topic: 'a-topic', data: { value: 1 } }, callback: callback });
    await flush();

    expect(callback).toHaveBeenCalledTimes(1);
  });

  test('does not throw when the emitter is not configured yet', () => {
    const { helper } = createHelper();
    helper['emitter'] = undefined as AnyType;

    expect(() =>
      helper.send({ destination: 'client-a', payload: { topic: 'a-topic', data: { value: 1 } } }),
    ).not.toThrow();
  });
});

describe('SocketIOServerHelper | shutdown', () => {
  test('disconnects every client, clears the registry and quits redis', async () => {
    const { helper, io, redisClients } = createHelper();
    const socket = createMockSocket('client-a');

    helper.onClientConnect({ socket });
    await authenticate({ socket });

    await helper.shutdown();
    helpers.pop();

    expect(socket.disconnect).toHaveBeenCalled();
    expect((helper.getClients() as Map<string, ISocketIOClient>).size).toBe(0);
    expect(io.close).toHaveBeenCalledTimes(1);
    for (const client of redisClients) {
      expect(client.quit).toHaveBeenCalledTimes(1);
    }
  });

  test('still quits redis when configure() never ran', async () => {
    const { helper, redisClients } = createHelper();
    helper['io'] = undefined as AnyType;

    await helper.shutdown();
    helpers.pop();

    for (const client of redisClients) {
      expect(client.quit).toHaveBeenCalledTimes(1);
    }
  });
});
