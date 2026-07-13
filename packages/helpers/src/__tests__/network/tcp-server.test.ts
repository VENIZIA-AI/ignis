import { afterEach, describe, expect, test } from 'bun:test';
import { AnyType } from '@/common';
import { getError } from '@/modules/error';
import { ITcpSocketServerOptions, NetworkTcpServer } from '@/modules/network';
import { dayjs } from '@/utilities/date.utility';
import { AddressInfo, connect, Socket } from 'node:net';

interface IDeferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

const createDeferred = <T>(): IDeferred<T> => {
  let resolve: (value: T) => void = () => {};

  const promise = new Promise<T>(promiseResolve => {
    resolve = promiseResolve;
  });

  return { promise, resolve };
};

const openServers: Array<NetworkTcpServer> = [];
const openSockets: Array<Socket> = [];

let serverCounter = 0;

const startServer = (
  opts: Partial<Omit<ITcpSocketServerOptions, 'createServerFn'>> = {},
): Promise<{ server: NetworkTcpServer; port: number }> => {
  return new Promise(resolve => {
    const server = NetworkTcpServer.newInstance({
      identifier: `tcp-server-test-${serverCounter++}`,
      serverOptions: {},
      listenOptions: { port: 0, host: '127.0.0.1' },
      authenticateOptions: { required: false },
      ...opts,
      onServerReady: options => {
        opts.onServerReady?.(options);

        const address = options.server.address() as AddressInfo;
        resolve({ server, port: address.port });
      },
    });

    openServers.push(server);
  });
};

const connectClient = (opts: { port: number }): Promise<Socket> => {
  return new Promise(resolve => {
    const socket = connect({ port: opts.port, host: '127.0.0.1' }, () => {
      resolve(socket);
    });

    openSockets.push(socket);
  });
};

const closeSocket = (opts: { socket: Socket }): Promise<void> => {
  return new Promise(resolve => {
    if (opts.socket.destroyed) {
      resolve();
      return;
    }

    opts.socket.once('close', () => {
      resolve();
    });
    opts.socket.destroy();
  });
};

interface ILoggedError {
  scope: string;
  args: Array<AnyType>;
}

const captureLoggerErrors = (opts: { server: NetworkTcpServer }): Array<ILoggedError> => {
  const recorded: Array<ILoggedError> = [];

  opts.server.logger = {
    for: (scope: string) => {
      return {
        info: () => {},
        warn: () => {},
        debug: () => {},
        fatal: () => {},
        error: (...args: Array<AnyType>) => {
          recorded.push({ scope, args });
        },
      };
    },
  } as AnyType;

  return recorded;
};

const waitForLoggedError = async (opts: {
  recorded: Array<ILoggedError>;
}): Promise<ILoggedError> => {
  for (let attempt = 0; attempt < 50; attempt++) {
    if (opts.recorded.length > 0) {
      return opts.recorded[0];
    }

    await new Promise(resolve => {
      setTimeout(resolve, 10);
    });
  }

  throw getError({ message: 'No error was logged within the allowed attempts' });
};

afterEach(async () => {
  await Promise.all(openSockets.splice(0).map(socket => closeSocket({ socket })));

  for (const server of openServers.splice(0)) {
    for (const client of Object.values(server.getClients())) {
      client.socket.destroy();
    }

    server.getServer().close();
  }
});

describe('NetworkTcpServer - lifecycle and client registry', () => {
  test('server listens on the OS assigned port and hands the server to onServerReady', async () => {
    let readyServer: AnyType;
    const { port } = await startServer({
      onServerReady: options => {
        readyServer = options.server;
      },
    });

    expect(port).toBeGreaterThan(0);
    expect(readyServer).toBeDefined();
    expect(readyServer.listening).toBe(true);
  });

  test('a connected client is tracked with an id, a dayjs connectedAt and an authenticated state', async () => {
    const connected = createDeferred<{ id: string }>();
    const { server, port } = await startServer({
      onClientConnected: options => {
        connected.resolve({ id: options.id });
      },
    });

    await connectClient({ port });
    const { id } = await connected.promise;

    const client = server.getClient({ id });
    expect(client).toBeDefined();
    expect(client.id).toBe(id);
    expect(client.state).toBe('authenticated');
    expect(client.subscriptions.size).toBe(0);
    expect(dayjs.isDayjs(client.storage.connectedAt)).toBe(true);
    expect(dayjs.isDayjs(client.storage.authenticatedAt)).toBe(true);
    expect(Object.keys(server.getClients())).toEqual([id]);
  });

  test('onClientData receives what the client writes and emit() writes back to that client', async () => {
    const received = createDeferred<{ id: string; data: string }>();
    const { server, port } = await startServer({
      onClientData: options => {
        received.resolve({ id: options.id, data: options.data.toString() });
      },
    });

    const socket = await connectClient({ port });
    const echoed = createDeferred<string>();
    socket.on('data', data => {
      echoed.resolve(data.toString());
    });

    socket.write('ping');
    const { id, data } = await received.promise;
    expect(data).toBe('ping');

    server.emit({ clientId: id, payload: 'pong' });
    expect(await echoed.promise).toBe('pong');
  });

  test('a disconnecting client fires onClientClose and is removed from the registry', async () => {
    const closed = createDeferred<{ id: string }>();
    const { server, port } = await startServer({
      onClientClose: options => {
        closed.resolve({ id: options.id });
      },
    });

    const socket = await connectClient({ port });
    await closeSocket({ socket });

    const { id } = await closed.promise;
    expect(server.getClient({ id })).toBeUndefined();
    expect(Object.keys(server.getClients())).toEqual([]);
  });

  test('repeated connect / disconnect cycles do NOT grow the client registry', async () => {
    let closedCount = 0;
    const allClosed = createDeferred<void>();
    const cycles = 25;

    const { server, port } = await startServer({
      onClientClose: () => {
        closedCount++;

        if (closedCount === cycles) {
          allClosed.resolve();
        }
      },
    });

    for (let cycle = 0; cycle < cycles; cycle++) {
      const socket = await connectClient({ port });
      await closeSocket({ socket });
    }

    await allClosed.promise;
    expect(Object.keys(server.getClients()).length).toBe(0);
  });
});

describe('NetworkTcpServer - authentication flow', () => {
  test('the constructor REJECTS a required authentication without a duration', () => {
    expect(() => {
      NetworkTcpServer.newInstance({
        identifier: 'tcp-server-invalid-auth',
        serverOptions: {},
        listenOptions: { port: 0, host: '127.0.0.1' },
        authenticateOptions: { required: true },
      });
    }).toThrow('TCP Server | Invalid authenticate duration');
  });

  test('a new client starts unauthorized and doAuthenticate promotes it', async () => {
    const connected = createDeferred<{ id: string }>();
    const { server, port } = await startServer({
      authenticateOptions: { required: true, duration: 30_000 },
      onClientConnected: options => {
        connected.resolve({ id: options.id });
      },
    });

    await connectClient({ port });
    const { id } = await connected.promise;

    expect(server.getClient({ id }).state).toBe('unauthorized');
    expect(server.getClient({ id }).storage.authenticatedAt).toBeNull();

    server.doAuthenticate({ id, state: 'authenticating' });
    expect(server.getClient({ id }).state).toBe('authenticating');
    expect(server.getClient({ id }).storage.authenticatedAt).toBeNull();

    server.doAuthenticate({ id, state: 'authenticated' });
    expect(server.getClient({ id }).state).toBe('authenticated');
    expect(dayjs.isDayjs(server.getClient({ id }).storage.authenticatedAt)).toBe(true);
  });

  test('an unauthenticated client is warned and kicked once the duration elapses', async () => {
    const { port } = await startServer({
      authenticateOptions: { required: true, duration: 50 },
    });

    const socket = await connectClient({ port });

    const payload = createDeferred<string>();
    socket.on('data', data => {
      payload.resolve(data.toString());
    });

    const closed = createDeferred<void>();
    socket.on('close', () => {
      closed.resolve();
    });

    expect(await payload.promise).toBe('Unauthorized Client');
    await closed.promise;
  });

  test('an AUTHENTICATED client is NOT kicked once the duration elapses', async () => {
    const duration = 50;
    const connected = createDeferred<{ id: string }>();
    const { server, port } = await startServer({
      authenticateOptions: { required: true, duration },
      onClientConnected: options => {
        connected.resolve({ id: options.id });
      },
    });

    const socket = await connectClient({ port });
    const { id } = await connected.promise;
    server.doAuthenticate({ id, state: 'authenticated' });

    // No event marks "the kick did not happen" - only outliving the deadline proves it.
    await new Promise(resolve => {
      setTimeout(resolve, duration * 6);
    });

    expect(socket.destroyed).toBe(false);
    expect(server.getClient({ id })).toBeDefined();
  });

  test('a client disconnecting MID authentication has its kick timer cleared', async () => {
    const originalSetTimeout = globalThis.setTimeout;
    const originalClearTimeout = globalThis.clearTimeout;

    const duration = 30_000;
    const scheduled: Array<AnyType> = [];
    const cleared: Array<AnyType> = [];

    globalThis.setTimeout = ((handler: AnyType, timeout?: number, ...args: Array<AnyType>) => {
      const handle = originalSetTimeout(handler, timeout, ...args);

      if (timeout === duration) {
        scheduled.push(handle);
      }

      return handle;
    }) as AnyType;

    globalThis.clearTimeout = ((handle: AnyType) => {
      cleared.push(handle);
      return originalClearTimeout(handle);
    }) as AnyType;

    try {
      const closed = createDeferred<void>();
      const { port } = await startServer({
        authenticateOptions: { required: true, duration },
        onClientClose: () => {
          closed.resolve();
        },
      });

      const socket = await connectClient({ port });
      await closeSocket({ socket });
      await closed.promise;

      // A leaked kick timer holds the socket closure - and the event loop - for the whole duration.
      expect(scheduled.length).toBe(1);
      expect(cleared).toContain(scheduled[0]);
    } finally {
      globalThis.setTimeout = originalSetTimeout;
      globalThis.clearTimeout = originalClearTimeout;
    }
  });

  test('authenticating a client clears its pending kick timer', async () => {
    const connected = createDeferred<{ id: string }>();
    const { server, port } = await startServer({
      authenticateOptions: { required: true, duration: 30_000 },
      onClientConnected: options => {
        connected.resolve({ id: options.id });
      },
    });

    await connectClient({ port });
    const { id } = await connected.promise;

    expect(server.getClient({ id }).storage.authenticateTimeout).toBeDefined();

    server.doAuthenticate({ id, state: 'authenticated' });
    expect(server.getClient({ id }).storage.authenticateTimeout).toBeNull();
  });
});

describe('NetworkTcpServer - hook hardening', () => {
  test('onClientError is WIRED and receives the socket error', async () => {
    const failed = createDeferred<{ id: string; error: Error }>();

    // The hook is only reachable if the constructor actually stores it.
    const { server } = await startServer({
      onClientError: options => {
        failed.resolve({ id: options.id, error: options.error });
      },
    });

    const socket = new Socket();
    openSockets.push(socket);
    server.onNewConnection({ socket });

    socket.emit('error', getError({ message: 'boom' }));

    const { id, error } = await failed.promise;
    expect(error.message).toBe('boom');
    expect(server.getClient({ id })).toBeDefined();
  });

  test('an extraEvents handler throwing SYNCHRONOUSLY is logged, never escapes the listener', async () => {
    const { server } = await startServer({
      extraEvents: {
        'custom-event': () => {
          throw getError({ message: 'sync handler exploded' });
        },
      },
    });

    const recorded = captureLoggerErrors({ server });

    const socket = new Socket();
    openSockets.push(socket);
    server.onNewConnection({ socket });

    expect(() => {
      socket.emit('custom-event', { value: 1 });
    }).not.toThrow();

    const logged = await waitForLoggedError({ recorded });
    expect(logged.scope).toBe('onClientConnect');
    expect(String(logged.args[1])).toContain('sync handler exploded');
  });

  test('an extraEvents handler REJECTING asynchronously is logged, never escapes the listener', async () => {
    const { server } = await startServer({
      extraEvents: {
        'custom-event': async () => {
          throw getError({ message: 'async handler exploded' });
        },
      },
    });

    const recorded = captureLoggerErrors({ server });

    const socket = new Socket();
    openSockets.push(socket);
    server.onNewConnection({ socket });

    expect(() => {
      socket.emit('custom-event', { value: 1 });
    }).not.toThrow();

    const logged = await waitForLoggedError({ recorded });
    expect(String(logged.args[1])).toContain('async handler exploded');
  });

  test('a throwing onClientData is logged, never escapes the socket listener', async () => {
    const { server } = await startServer({
      onClientData: () => {
        throw getError({ message: 'data hook exploded' });
      },
    });

    const recorded = captureLoggerErrors({ server });

    const socket = new Socket();
    openSockets.push(socket);
    server.onNewConnection({ socket });

    expect(() => {
      socket.emit('data', Buffer.from('payload'));
    }).not.toThrow();

    const logged = await waitForLoggedError({ recorded });
    expect(logged.scope).toBe('onClientData');
  });

  test('a throwing onClientClose STILL removes the client from the registry', async () => {
    const { server } = await startServer({
      onClientClose: () => {
        throw getError({ message: 'close hook exploded' });
      },
    });

    captureLoggerErrors({ server });

    const socket = new Socket();
    openSockets.push(socket);
    server.onNewConnection({ socket });

    expect(Object.keys(server.getClients()).length).toBe(1);

    expect(() => {
      socket.emit('close', false);
    }).not.toThrow();

    // A hook that throws must not strand the client entry - that registry never shrinks again.
    expect(Object.keys(server.getClients()).length).toBe(0);
  });
});

describe('NetworkTcpServer - emit guards', () => {
  test('emit to an UNKNOWN client logs and writes nothing', async () => {
    const { server } = await startServer({});
    const recorded = captureLoggerErrors({ server });

    server.emit({ clientId: 'not-a-client', payload: 'hello' });

    expect(recorded.length).toBe(1);
    expect(recorded[0].scope).toBe('emit');
  });

  test('emit of an EMPTY payload writes nothing to the socket', async () => {
    const connected = createDeferred<{ id: string }>();
    const { server, port } = await startServer({
      onClientConnected: options => {
        connected.resolve({ id: options.id });
      },
    });

    const socket = await connectClient({ port });
    const { id } = await connected.promise;

    let receivedBytes = 0;
    socket.on('data', data => {
      receivedBytes += data.length;
    });

    server.emit({ clientId: id, payload: '' });

    await new Promise(resolve => {
      setTimeout(resolve, 50);
    });

    expect(receivedBytes).toBe(0);
  });

  test('emit to a NON writable socket logs instead of throwing', async () => {
    const connected = createDeferred<{ id: string }>();
    const { server, port } = await startServer({
      onClientConnected: options => {
        connected.resolve({ id: options.id });
      },
    });

    const socket = await connectClient({ port });
    const { id } = await connected.promise;

    const serverSideSocket = server.getClient({ id }).socket;
    serverSideSocket.destroy();

    const recorded = captureLoggerErrors({ server });

    expect(() => {
      server.emit({ clientId: id, payload: 'hello' });
    }).not.toThrow();

    expect(recorded.length).toBe(1);
    expect(String(recorded[0].args[0])).toContain('NOT WRITABLE');

    await closeSocket({ socket });
  });
});
