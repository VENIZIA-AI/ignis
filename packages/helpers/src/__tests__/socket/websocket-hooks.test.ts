/**
 * WebSocketServerHelper user-hook safety suite - complements websocket.test.ts (happy/async-rejection
 * paths). Covers hooks that throw SYNCHRONOUSLY, which would otherwise escape the Bun socket handlers and take the process down.
 */

import type { AnyType } from '@/common/types';
import { getError } from '@/modules/error';
import type { IRedisHelper } from '@/modules/redis';
import {
  IWebSocketClient,
  IWebSocketServerOptions,
  WebSocketClientStates,
  WebSocketEvents,
  WebSocketServerHelper,
} from '@/modules/socket/websocket';
import { afterEach, describe, expect, mock, test } from 'bun:test';
import { EventEmitter } from 'node:events';

const flush = () => new Promise<void>(resolve => setImmediate(resolve));

class MockRedisClient extends EventEmitter {
  status = 'ready';
  quit = mock(() => Promise.resolve('OK'));
  publish = mock(() => Promise.resolve(1));
  subscribe = mock(() => Promise.resolve(1));
  psubscribe = mock(() => Promise.resolve(1));
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

const createMockSocket = (clientId: string) => {
  return {
    data: { clientId },
    send: mock(() => 1),
    close: mock(() => {}),
    subscribe: mock(() => {}),
    unsubscribe: mock(() => {}),
    isSubscribed: mock(() => false),
    cork: mock(() => {}),
    remoteAddress: '127.0.0.1',
    readyState: 1,
  };
};

const helpers: WebSocketServerHelper[] = [];

const createHelper = (opts?: Partial<IWebSocketServerOptions>) => {
  const { helper: redisConnection, clients } = createMockRedisHelper();

  const helper = new WebSocketServerHelper({
    identifier: 'test-ws-server',
    redisConnection,
    server: { publish: mock(() => 1), pendingWebSockets: 0 },
    authenticateFn: () => ({ userId: 'user-a' }),
    ...opts,
  } as IWebSocketServerOptions);

  helpers.push(helper);
  return { helper, redisClients: clients };
};

const connectAndAuthenticate = async (opts: {
  helper: WebSocketServerHelper;
  clientId: string;
  socket: ReturnType<typeof createMockSocket>;
}) => {
  const { helper, clientId, socket } = opts;

  helper.onClientConnect({ clientId, socket });
  helper.onClientMessage({
    clientId,
    raw: JSON.stringify({ event: WebSocketEvents.AUTHENTICATE, data: {} }),
  });

  await flush();
  await flush();
};

afterEach(async () => {
  while (helpers.length) {
    const helper = helpers.pop();
    await helper?.shutdown();
  }
});

describe('WebSocketServerHelper | synchronously throwing hooks', () => {
  test('a throwing messageHandler does not escape the socket message handler', async () => {
    const { helper } = createHelper({
      messageHandler: () => {
        throw getError({ message: 'sync messageHandler boom' });
      },
    });
    const socket = createMockSocket('client-a');
    await connectAndAuthenticate({ helper, clientId: 'client-a', socket });

    expect(() =>
      helper.onClientMessage({
        clientId: 'client-a',
        raw: JSON.stringify({ event: 'custom-event', data: { value: 1 } }),
      }),
    ).not.toThrow();
  });

  test('a throwing validateRoomFn does not escape the socket message handler', async () => {
    const { helper } = createHelper({
      validateRoomFn: () => {
        throw getError({ message: 'sync validateRoomFn boom' });
      },
    });
    const socket = createMockSocket('client-a');
    await connectAndAuthenticate({ helper, clientId: 'client-a', socket });

    expect(() =>
      helper.onClientMessage({
        clientId: 'client-a',
        raw: JSON.stringify({ event: WebSocketEvents.JOIN, data: { rooms: ['room-a'] } }),
      }),
    ).not.toThrow();
  });

  test('a throwing clientDisconnectedFn does not escape the socket close handler', async () => {
    const { helper } = createHelper({
      clientDisconnectedFn: () => {
        throw getError({ message: 'sync clientDisconnectedFn boom' });
      },
    });
    const socket = createMockSocket('client-a');
    await connectAndAuthenticate({ helper, clientId: 'client-a', socket });

    expect(() => helper.onClientDisconnect({ clientId: 'client-a' })).not.toThrow();
    expect(helper.getClients({ id: 'client-a' })).toBeUndefined();
  });

  test('a throwing clientDisconnectedFn does not abort shutdown', async () => {
    const { helper, redisClients } = createHelper({
      clientDisconnectedFn: () => {
        throw getError({ message: 'sync clientDisconnectedFn boom' });
      },
    });
    const socket = createMockSocket('client-a');
    await connectAndAuthenticate({ helper, clientId: 'client-a', socket });

    await helper.shutdown();
    helpers.pop();

    expect((helper.getClients() as Map<string, IWebSocketClient>).size).toBe(0);
    for (const client of redisClients) {
      expect(client.quit).toHaveBeenCalledTimes(1);
    }
  });

  test('a throwing outboundTransformer does not escape sendToClient', async () => {
    const { helper } = createHelper({
      outboundTransformer: () => {
        throw getError({ message: 'sync outboundTransformer boom' });
      },
    });
    const socket = createMockSocket('client-a');
    await connectAndAuthenticate({ helper, clientId: 'client-a', socket });
    helper.enableClientEncryption({ clientId: 'client-a' });

    expect(() =>
      helper.sendToClient({ clientId: 'client-a', event: 'a-event', data: { value: 1 } }),
    ).not.toThrow();
  });

  test('a throwing clientConnectedFn does not drop the authenticated client', async () => {
    const { helper } = createHelper({
      clientConnectedFn: () => {
        throw getError({ message: 'sync clientConnectedFn boom' });
      },
    });
    const socket = createMockSocket('client-a');

    await connectAndAuthenticate({ helper, clientId: 'client-a', socket });
    await flush();

    const client = helper.getClients({ id: 'client-a' }) as IWebSocketClient;
    expect(client?.state).toBe(WebSocketClientStates.AUTHENTICATED);
    expect(socket.close).not.toHaveBeenCalled();
  });
});
