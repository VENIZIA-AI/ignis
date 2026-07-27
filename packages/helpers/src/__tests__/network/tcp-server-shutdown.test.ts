import { afterEach, describe, expect, test } from 'bun:test';
import { connect, createServer, Socket } from 'node:net';
import { NetworkTcpServer } from '@/modules/network';

/** server.close() never resolves while a client is attached (node holds the handle until every socket is destroyed), so shutdown() must tear clients down itself - getServer().close() alone hangs. */
const openServers: NetworkTcpServer[] = [];
const openSockets: Socket[] = [];

afterEach(async () => {
  for (const socket of openSockets.splice(0)) {
    socket.destroy();
  }

  for (const server of openServers.splice(0)) {
    await server.shutdown();
  }
});

const startServer = async (): Promise<{ server: NetworkTcpServer; port: number }> => {
  const server = await new Promise<NetworkTcpServer>(resolve => {
    const instance = new NetworkTcpServer({
      identifier: 'shutdown-test',
      serverOptions: {},
      listenOptions: { port: 0, host: '127.0.0.1' },
      authenticateOptions: { required: false },
      onServerReady: () => {
        resolve(instance);
      },
    });
    instance.configure();
  });

  openServers.push(server);
  const address = server.getServer()?.address();
  const port = typeof address === 'object' && address ? address.port : 0;

  return { server, port };
};

const connectClient = async (port: number): Promise<Socket> => {
  const socket = await new Promise<Socket>(resolve => {
    const client = connect({ port, host: '127.0.0.1' }, () => {
      resolve(client);
    });
  });

  openSockets.push(socket);
  return socket;
};

const waitFor = async (predicate: () => boolean, timeoutMs = 2_000): Promise<void> => {
  const deadline = Date.now() + timeoutMs;

  while (!predicate()) {
    if (Date.now() >= deadline) {
      throw new Error('[waitFor] Condition never became true');
    }

    await Bun.sleep(5);
  }
};

describe('NetworkTcpServer.shutdown', () => {
  test('resolves even while clients are still attached - the sockets are destroyed first', async () => {
    const { server, port } = await startServer();
    await connectClient(port);
    await connectClient(port);
    await waitFor(() => Object.keys(server.getClients()).length === 2);

    // A bare getServer().close() would never settle here; shutdown() must.
    await server.shutdown();

    expect(Object.keys(server.getClients())).toHaveLength(0);
    expect(server.getServer()?.listening).toBe(false);
  });

  test('the listener stops accepting - a new connection after shutdown is refused', async () => {
    const { server, port } = await startServer();
    await connectClient(port);
    await waitFor(() => Object.keys(server.getClients()).length === 1);

    await server.shutdown();

    const refusal = await new Promise<string>(resolve => {
      const late = connect({ port, host: '127.0.0.1' }, () => {
        resolve('CONNECTED');
      });
      late.on('error', (error: NodeJS.ErrnoException) => {
        resolve(error.code ?? 'ERROR');
      });
    });

    expect(refusal).not.toBe('CONNECTED');
    expect(Object.keys(server.getClients())).toHaveLength(0);
  });

  test('a connected client observes the close', async () => {
    const { server, port } = await startServer();
    const socket = await connectClient(port);
    await waitFor(() => Object.keys(server.getClients()).length === 1);

    let isClosed = false;
    socket.on('close', () => {
      isClosed = true;
    });

    await server.shutdown();
    await waitFor(() => isClosed);

    expect(isClosed).toBe(true);
  });

  test('shutdown is idempotent - a second call resolves without throwing', async () => {
    const { server, port } = await startServer();
    await connectClient(port);
    await waitFor(() => Object.keys(server.getClients()).length === 1);

    await server.shutdown();
    await server.shutdown();

    expect(Object.keys(server.getClients())).toHaveLength(0);
  });

  test('shutdown on a server that never listened resolves', async () => {
    const server = new NetworkTcpServer({
      identifier: 'shutdown-unconfigured',
      serverOptions: {},
      listenOptions: { port: 0, host: '127.0.0.1' },
      authenticateOptions: { required: false },
    });

    await server.shutdown();

    expect(Object.keys(server.getClients())).toHaveLength(0);
  });

  test('a pending authenticate timer does not outlive shutdown', async () => {
    const server = await new Promise<NetworkTcpServer>(resolve => {
      const instance = new NetworkTcpServer({
        identifier: 'shutdown-auth',
        serverOptions: {},
        listenOptions: { port: 0, host: '127.0.0.1' },
        // A client that never authenticates holds a 30s kick timer; shutdown must clear it.
        authenticateOptions: { required: true, duration: 30_000 },
        onServerReady: () => {
          resolve(instance);
        },
      });
      instance.configure();
    });
    openServers.push(server);

    const address = server.getServer()?.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    await connectClient(port);
    await waitFor(() => Object.keys(server.getClients()).length === 1);

    // Captured BEFORE shutdown: the registry empties first, so the socket's own 'close' handler can no longer find the client to clear its kick timer - only shutdown() can, and an armed timer keeps the event loop alive.
    const [client] = Object.values(server.getClients());
    expect(client.storage.authenticateTimeout).toBeDefined();
    expect(client.storage.authenticateTimeout).not.toBeNull();

    await server.shutdown();

    expect(client.storage.authenticateTimeout).toBeNull();
    expect(Object.keys(server.getClients())).toHaveLength(0);
  });
});

describe('NetworkTcpServer - a failed listen must not crash the process', () => {
  test('a port already in use is logged and routed to onServerError, never thrown', async () => {
    const blocker = createServer();
    await new Promise<void>(resolve => {
      blocker.listen({ port: 0, host: '127.0.0.1' }, resolve);
    });
    const address = blocker.address();
    const port = typeof address === 'object' && address ? address.port : 0;

    let uncaught: unknown;
    const onUncaught = (error: unknown) => {
      uncaught = error;
    };
    process.on('uncaughtException', onUncaught);

    let reported: Error | undefined;
    const server = new NetworkTcpServer({
      identifier: 'listen-conflict',
      serverOptions: {},
      listenOptions: { port, host: '127.0.0.1' },
      authenticateOptions: { required: false },
      onServerError: opts => {
        reported = opts.error;
      },
    });
    openServers.push(server);

    await waitFor(() => reported !== undefined);

    process.off('uncaughtException', onUncaught);
    blocker.close();

    // Without the server-level 'error' listener this is an unhandled event: the process dies at boot with a cryptic message instead of surfacing a clean, catchable failure.
    expect(uncaught).toBeUndefined();
    expect((reported as NodeJS.ErrnoException).code).toBe('EADDRINUSE');
  });
});
