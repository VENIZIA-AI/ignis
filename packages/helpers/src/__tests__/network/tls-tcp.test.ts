import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { NetworkTlsTcpClient, NetworkTlsTcpServer } from '@/modules/network';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// A real handshake needs a real certificate: openssl mints a throwaway self signed pair per run.
let certificateDirectory: string;
let key: string;
let cert: string;

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

const openServers: Array<NetworkTlsTcpServer> = [];
const openClients: Array<NetworkTlsTcpClient> = [];

beforeAll(() => {
  certificateDirectory = mkdtempSync(join(tmpdir(), 'ignis-tls-test-'));

  const keyPath = join(certificateDirectory, 'key.pem');
  const certificatePath = join(certificateDirectory, 'cert.pem');

  execFileSync('openssl', [
    'req',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-keyout',
    keyPath,
    '-out',
    certificatePath,
    '-days',
    '1',
    '-subj',
    '/CN=127.0.0.1',
    '-addext',
    'subjectAltName=IP:127.0.0.1',
  ]);

  key = readFileSync(keyPath, 'utf-8');
  cert = readFileSync(certificatePath, 'utf-8');
});

afterAll(() => {
  rmSync(certificateDirectory, { recursive: true, force: true });
});

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

const startServer = (opts: {
  onClientData?: (options: { id: string; data: Buffer | string }) => void;
}): Promise<{ server: NetworkTlsTcpServer; port: number }> => {
  return new Promise(resolve => {
    const server = NetworkTlsTcpServer.newInstance({
      identifier: 'tls-tcp-test-server',
      serverOptions: { key, cert },
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

describe('NetworkTlsTcpServer / NetworkTlsTcpClient - real handshake', () => {
  test('openssl produced a usable key pair', () => {
    expect(key).toContain('PRIVATE KEY');
    expect(cert).toContain('CERTIFICATE');
  });

  test('a TLS client completes the handshake and round trips a payload', async () => {
    const serverReceived = createDeferred<string>();
    const { server, port } = await startServer({
      onClientData: options => {
        server.emit({ clientId: options.id, payload: `echo:${options.data.toString()}` });
        serverReceived.resolve(options.data.toString());
      },
    });

    const connected = createDeferred<void>();
    const clientReceived = createDeferred<string>();

    const client = NetworkTlsTcpClient.newInstance({
      identifier: 'tls-tcp-test-client',
      options: { port, host: '127.0.0.1', ca: [cert] },
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

    const socket = client.getClient();
    expect(socket?.encrypted).toBe(true);
    expect(socket?.authorized).toBe(true);

    client.emit({ payload: 'ping' });

    expect(await serverReceived.promise).toBe('ping');
    expect(await clientReceived.promise).toBe('echo:ping');

    expect(Object.keys(server.getClients()).length).toBe(1);
  });

  test('an UNTRUSTED certificate is rejected - onError fires, no client is registered', async () => {
    const { server, port } = await startServer({});

    const failed = createDeferred<Error>();
    const client = NetworkTlsTcpClient.newInstance({
      identifier: 'tls-tcp-test-client-untrusted',
      options: { port, host: '127.0.0.1' },
      onError: error => {
        failed.resolve(error);
      },
    });
    openClients.push(client);

    client.connect({ resetReconnectCounter: true });

    const error = await failed.promise;
    expect(error).toBeDefined();
    expect(Object.keys(server.getClients()).length).toBe(0);
  });

  test('the server REJECTS a required authentication without a duration', () => {
    expect(() => {
      NetworkTlsTcpServer.newInstance({
        identifier: 'tls-tcp-test-server-invalid-auth',
        serverOptions: { key, cert },
        listenOptions: { port: 0, host: '127.0.0.1' },
        authenticateOptions: { required: true },
      });
    }).toThrow('TCP Server | Invalid authenticate duration');
  });
});
