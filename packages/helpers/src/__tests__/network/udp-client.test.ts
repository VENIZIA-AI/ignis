import { afterEach, describe, expect, test } from 'bun:test';
import { AnyType } from '@/common';
import { getError } from '@/modules/error';
import { NetworkUdpClient } from '@/modules/network';
import dgram from 'node:dgram';

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

interface ILoggedError {
  scope: string;
  args: Array<AnyType>;
}

const captureLoggerErrors = (opts: { client: NetworkUdpClient }): Array<ILoggedError> => {
  const recorded: Array<ILoggedError> = [];

  opts.client.logger = {
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

const openClients: Array<NetworkUdpClient> = [];
const openSockets: Array<dgram.Socket> = [];

afterEach(() => {
  for (const client of openClients.splice(0)) {
    client.disconnect();
  }

  for (const socket of openSockets.splice(0)) {
    try {
      socket.close();
    } catch (error) {
      // A socket that already errored out is closed by the runtime - nothing left to release.
      expect(String(error)).toContain('ERR_SOCKET_DGRAM_NOT_RUNNING');
    }
  }
});

const bindRawSocket = (): Promise<{ socket: dgram.Socket; port: number }> => {
  return new Promise(resolve => {
    const socket = dgram.createSocket({ type: 'udp4' });
    openSockets.push(socket);

    socket.bind({ port: 0, address: '127.0.0.1' }, () => {
      resolve({ socket, port: socket.address().port });
    });
  });
};

describe('NetworkUdpClient - bind and round trip', () => {
  test('connect() binds on port 0 and both onBind and onConnected fire', async () => {
    const bound = createDeferred<{ port: number; socket: dgram.Socket }>();
    const connected = createDeferred<void>();

    const client = NetworkUdpClient.newInstance({
      identifier: 'udp-bind',
      host: '127.0.0.1',
      // Port 0 asks the OS for a free port - the only way to bind deterministically in a test.
      port: 0,
      onBind: options => {
        bound.resolve({ port: options.port, socket: options.socket });
      },
      onConnected: () => {
        connected.resolve();
      },
    });
    openClients.push(client);

    client.connect();
    const { socket } = await bound.promise;
    await connected.promise;

    expect(client.isConnected()).toBeTruthy();
    expect(socket.address().port).toBeGreaterThan(0);
    expect(client.getClient()).toBe(socket);
  });

  test('a datagram sent to the bound port reaches onData with its remoteInfo', async () => {
    const bound = createDeferred<void>();
    const received = createDeferred<{ message: string; remoteInfo: dgram.RemoteInfo }>();

    const client = NetworkUdpClient.newInstance({
      identifier: 'udp-receive',
      host: '127.0.0.1',
      port: 0,
      onBind: () => {
        bound.resolve();
      },
      onData: options => {
        received.resolve({
          message: options.message.toString(),
          remoteInfo: options.remoteInfo,
        });
      },
    });
    openClients.push(client);

    client.connect();
    await bound.promise;

    const boundPort = client.getClient()!.address().port;

    const { socket: sender } = await bindRawSocket();
    sender.send('hello-udp', boundPort, '127.0.0.1');

    const { message, remoteInfo } = await received.promise;
    expect(message).toBe('hello-udp');
    expect(remoteInfo.address).toBe('127.0.0.1');
    expect(remoteInfo.port).toBeGreaterThan(0);
  });

  test('the bound socket can send datagrams out to a peer', async () => {
    const { socket: peer, port: peerPort } = await bindRawSocket();

    const peerReceived = createDeferred<string>();
    peer.on('message', message => {
      peerReceived.resolve(message.toString());
    });

    const bound = createDeferred<void>();
    const client = NetworkUdpClient.newInstance({
      identifier: 'udp-send',
      host: '127.0.0.1',
      port: 0,
      onBind: () => {
        bound.resolve();
      },
    });
    openClients.push(client);

    client.connect();
    await bound.promise;

    client.getClient()!.send('from-helper', peerPort, '127.0.0.1');

    expect(await peerReceived.promise).toBe('from-helper');
  });

  test('disconnect() closes the socket, fires onClosed and is safe to repeat', async () => {
    const bound = createDeferred<void>();
    const closed = createDeferred<void>();

    const client = NetworkUdpClient.newInstance({
      identifier: 'udp-disconnect',
      host: '127.0.0.1',
      port: 0,
      onBind: () => {
        bound.resolve();
      },
      onClosed: () => {
        closed.resolve();
      },
    });

    client.connect();
    await bound.promise;

    client.disconnect();
    await closed.promise;

    expect(client.getClient()).toBeNull();
    expect(client.isConnected()).toBeFalsy();

    expect(() => {
      client.disconnect();
    }).not.toThrow();
  });

  test('connect() twice keeps the SAME socket - no orphaned bind', async () => {
    const bound = createDeferred<void>();
    const client = NetworkUdpClient.newInstance({
      identifier: 'udp-double-connect',
      host: '127.0.0.1',
      port: 0,
      onBind: () => {
        bound.resolve();
      },
    });
    openClients.push(client);

    client.connect();
    await bound.promise;

    const socket = client.getClient();
    client.connect();

    expect(client.getClient()).toBe(socket);
  });
});

describe('NetworkUdpClient - error paths', () => {
  test('a NEGATIVE port creates no socket', () => {
    const client = NetworkUdpClient.newInstance({
      identifier: 'udp-invalid-port',
      host: '127.0.0.1',
      port: -1,
    });

    client.connect();

    expect(client.getClient()).toBeUndefined();
    expect(client.isConnected()).toBeFalsy();
  });

  test('a MISSING port creates no socket', () => {
    const client = NetworkUdpClient.newInstance({
      identifier: 'udp-missing-port',
      host: '127.0.0.1',
      port: undefined as AnyType,
    });

    client.connect();

    expect(client.getClient()).toBeUndefined();
  });

  test('binding an ALREADY taken port surfaces the error through onError', async () => {
    const { port } = await bindRawSocket();

    const failed = createDeferred<Error>();
    const client = NetworkUdpClient.newInstance({
      identifier: 'udp-address-in-use',
      host: '127.0.0.1',
      port,
      onError: options => {
        failed.resolve(options.error);
      },
    });

    client.connect();

    const error = await failed.promise;
    expect(String(error)).toContain('EADDRINUSE');

    // The failed socket must still be releasable - a throw here would strand it for the process life.
    expect(() => {
      client.disconnect();
    }).not.toThrow();

    expect(client.getClient()).toBeNull();
  });

  test('an onBind throwing SYNCHRONOUSLY is logged, never escapes the dgram listener', async () => {
    const client = NetworkUdpClient.newInstance({
      identifier: 'udp-throwing-on-bind',
      host: '127.0.0.1',
      port: 0,
      onBind: () => {
        throw getError({ message: 'bind hook exploded' });
      },
    });
    openClients.push(client);

    const recorded = captureLoggerErrors({ client });
    client.connect();

    const logged = await waitForLoggedError({ recorded });
    expect(logged.scope).toBe('bind');
    expect(String(logged.args[1])).toContain('bind hook exploded');
    expect(client.getClient()).toBeDefined();
  });

  test('an onData throwing SYNCHRONOUSLY is logged, never escapes the dgram listener', async () => {
    const bound = createDeferred<void>();
    const client = NetworkUdpClient.newInstance({
      identifier: 'udp-throwing-on-data',
      host: '127.0.0.1',
      port: 0,
      onBind: () => {
        bound.resolve();
      },
      onData: () => {
        throw getError({ message: 'data hook exploded' });
      },
    });
    openClients.push(client);

    client.connect();
    await bound.promise;

    const boundPort = client.getClient()!.address().port;
    const recorded = captureLoggerErrors({ client });

    const { socket: sender } = await bindRawSocket();
    sender.send('payload', boundPort, '127.0.0.1');

    const logged = await waitForLoggedError({ recorded });
    expect(String(logged.args[1])).toContain('data hook exploded');
  });
});
