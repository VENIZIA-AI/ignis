import { afterEach, describe, expect, test } from 'bun:test';
import { AnyType } from '@/common';
import { NetworkTcpClient, NetworkTcpServer } from '@/modules/network';
import { AddressInfo } from 'node:net';

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
const openClients: Array<NetworkTcpClient> = [];

let serverCounter = 0;

const startServer = (opts: {
  onClientData?: (options: { id: string; data: Buffer | string }) => void;
}): Promise<{ server: NetworkTcpServer; port: number }> => {
  return new Promise(resolve => {
    const server = NetworkTcpServer.newInstance({
      identifier: `tcp-client-test-server-${serverCounter++}`,
      serverOptions: {},
      listenOptions: { port: 0, host: '127.0.0.1' },
      authenticateOptions: { required: false },
      onClientData: options => {
        opts.onClientData?.({ id: options.id, data: options.data });
      },
      onServerReady: options => {
        const address = options.server.address() as AddressInfo;
        resolve({ server, port: address.port });
      },
    });

    openServers.push(server);
  });
};

afterEach(() => {
  for (const client of openClients.splice(0)) {
    client.disconnect();
  }

  for (const server of openServers.splice(0)) {
    for (const client of Object.values(server.getClients())) {
      client.socket.destroy();
    }

    server.getServer().close();
  }
});

describe('NetworkTcpClient - connection round trip', () => {
  test('connect() reaches the server, emit() writes and onData receives the reply', async () => {
    const serverReceived = createDeferred<string>();
    const { server, port } = await startServer({
      onClientData: options => {
        server.emit({ clientId: options.id, payload: `echo:${options.data.toString()}` });
        serverReceived.resolve(options.data.toString());
      },
    });

    const connected = createDeferred<void>();
    const clientReceived = createDeferred<string>();

    const client = NetworkTcpClient.newInstance({
      identifier: 'tcp-client-round-trip',
      options: { port, host: '127.0.0.1' },
      onConnected: () => {
        connected.resolve();
      },
      onData: options => {
        clientReceived.resolve(options.message.toString());
      },
    });
    openClients.push(client);

    client.connect({ resetReconnectCounter: true });
    await connected.promise;

    expect(client.isConnected()).toBeTruthy();
    expect(client.getClient()).toBeDefined();

    client.emit({ payload: 'ping' });

    expect(await serverReceived.promise).toBe('ping');
    expect(await clientReceived.promise).toBe('echo:ping');
  });

  test('a configured encoding hands onData a STRING instead of a Buffer', async () => {
    const { server, port } = await startServer({
      onClientData: options => {
        server.emit({ clientId: options.id, payload: 'reply' });
      },
    });

    const received = createDeferred<string | Buffer>();
    const client = NetworkTcpClient.newInstance({
      identifier: 'tcp-client-encoding',
      options: { port, host: '127.0.0.1' },
      encoding: 'utf-8',
      onData: options => {
        received.resolve(options.message);
      },
    });
    openClients.push(client);

    client.connect({ resetReconnectCounter: true });
    client.emit({ payload: 'ping' });

    const message = await received.promise;
    expect(typeof message).toBe('string');
    expect(message).toBe('reply');
  });

  test('onClosed fires and disconnect() tears the socket down', async () => {
    const { port } = await startServer({});

    const connected = createDeferred<void>();
    const closed = createDeferred<void>();

    const client = NetworkTcpClient.newInstance({
      identifier: 'tcp-client-disconnect',
      options: { port, host: '127.0.0.1' },
      onConnected: () => {
        connected.resolve();
      },
      onClosed: () => {
        closed.resolve();
      },
    });
    openClients.push(client);

    client.connect({ resetReconnectCounter: true });
    await connected.promise;

    const socket = client.getClient();
    client.disconnect();

    await closed.promise;
    expect(socket?.destroyed).toBe(true);
    expect(client.getClient()).toBeNull();
    expect(client.isConnected()).toBeFalsy();
  });

  test('disconnect() clears any pending reconnect timer and is safe to call twice', async () => {
    const { port } = await startServer({});

    const client = NetworkTcpClient.newInstance({
      identifier: 'tcp-client-idempotent-disconnect',
      options: { port, host: '127.0.0.1' },
      reconnect: true,
    });
    openClients.push(client);

    client.connect({ resetReconnectCounter: true });
    client['reconnectTimeout'] = setTimeout(() => {}, 60_000);

    client.disconnect();
    expect(client['reconnectTimeout']).toBeNull();

    expect(() => {
      client.disconnect();
    }).not.toThrow();
  });
});

describe('NetworkTcpClient - guards', () => {
  test('connect() with EMPTY options creates no socket', () => {
    const client = NetworkTcpClient.newInstance({
      identifier: 'tcp-client-empty-options',
      options: {} as AnyType,
    });

    client.connect({ resetReconnectCounter: true });

    expect(client.getClient()).toBeUndefined();
    expect(client.isConnected()).toBeFalsy();
  });

  test('emit() before connect() writes nothing and does not throw', () => {
    const client = NetworkTcpClient.newInstance({
      identifier: 'tcp-client-emit-before-connect',
      options: { port: 1, host: '127.0.0.1' },
    });

    expect(() => {
      client.emit({ payload: 'ping' });
    }).not.toThrow();
  });

  test('connect() twice keeps the SAME socket - no orphaned connection', async () => {
    const { port } = await startServer({});

    const connected = createDeferred<void>();
    const client = NetworkTcpClient.newInstance({
      identifier: 'tcp-client-double-connect',
      options: { port, host: '127.0.0.1' },
      onConnected: () => {
        connected.resolve();
      },
    });
    openClients.push(client);

    client.connect({ resetReconnectCounter: true });
    await connected.promise;

    const socket = client.getClient();
    client.connect({ resetReconnectCounter: true });

    expect(client.getClient()).toBe(socket);
  });
});
