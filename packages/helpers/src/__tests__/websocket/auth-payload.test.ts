// What the server hands to `authenticate.fn` and `handshake.fn`: an object, checked by `authenticate.schema` when one is given.
import { afterEach, describe, expect, mock, test } from 'bun:test';
import { EventEmitter } from 'node:events';
import { z } from 'zod';
import { REDIS_HELPER_BRAND, type IRedisHelper } from '@/modules/redis';
import { WebSocketServerHelper } from '@/modules/socket/websocket';
import { WebSocketEvents } from '@/modules/socket/websocket/common';

class FakeRedisClient extends EventEmitter {
  status = 'ready';
  duplicate = () => new FakeRedisClient();
  connect = async () => {};
  subscribe = async () => {};
  psubscribe = async () => {};
  unsubscribe = async () => {};
  punsubscribe = async () => {};
  disconnect = () => {};
  publish = async () => 1;
  quit = async () => 'OK';
}

const redisConnection: object = {
  [REDIS_HELPER_BRAND]: true,
  duplicateClient: () => new FakeRedisClient(),
};
const isRedis = (value: object): value is IRedisHelper => REDIS_HELPER_BRAND in value;

const socket = () => ({
  data: { clientId: 'c1' },
  remoteAddress: '127.0.0.1',
  readyState: 1,
  send: mock(() => 1),
  subscribe: () => {},
  unsubscribe: () => {},
  isSubscribed: () => false,
  close: mock((_code?: number, _reason?: string) => {}),
  cork: () => {},
});

const helpers: Array<{ shutdown(): Promise<void> }> = [];

afterEach(async () => {
  for (const helper of helpers.splice(0)) {
    await helper.shutdown();
  }
});

/** Sends `payload` as the authentication data of a new client, and waits for the server to answer. */
const authenticate = async (opts: {
  helper: Pick<WebSocketServerHelper, 'onClientConnect' | 'onClientMessage' | 'shutdown'>;
  payload: unknown;
}) => {
  const { helper, payload } = opts;
  const client = socket();

  helpers.push(helper);
  helper.onClientConnect({ clientId: 'c1', socket: client });
  helper.onClientMessage({
    clientId: 'c1',
    raw: JSON.stringify({ event: WebSocketEvents.AUTHENTICATE, data: payload }),
  });
  await Bun.sleep(10);

  return client;
};

const base = () => {
  if (!isRedis(redisConnection)) {
    throw new Error('the fake is not a redis helper');
  }

  return {
    identifier: 'auth',
    redisConnection,
    server: { pendingWebSockets: 0, publish: () => 1 },
  };
};

describe('WebSocketServerHelper, the authentication payload', () => {
  test.each([
    ['a string', 'token'],
    ['a number', 7],
    ['a list', ['token']],
    ['null', null],
    ['nothing', undefined],
  ])('refuses %s without calling authenticateFn', async (_, payload) => {
    const authenticateFn = mock(() => ({ userId: 'u' }));
    const helper = new WebSocketServerHelper({ ...base(), authenticate: { fn: authenticateFn } });

    const client = await authenticate({ helper, payload });

    expect(authenticateFn).not.toHaveBeenCalled();
    expect(client.close).toHaveBeenCalledWith(4003, 'Authentication failed');
  });

  test('hands an object to authenticateFn as it came', async () => {
    const authenticateFn = mock((_data: Record<string, unknown>) => ({ userId: 'u' }));
    const helper = new WebSocketServerHelper({ ...base(), authenticate: { fn: authenticateFn } });

    const client = await authenticate({ helper, payload: { token: 't', extra: 1 } });

    expect(authenticateFn).toHaveBeenCalledWith({ token: 't', extra: 1 });
    expect(client.close).not.toHaveBeenCalled();
  });

  test('with a schema, hands over what the schema answers', async () => {
    const authenticateFn = mock((data: { token: string }) => ({ userId: data.token }));
    const handshakeFn = mock((_opts: { data: { token: string } }) => ({
      serverPublicKey: 'k',
      salt: 's',
    }));
    const helper = new WebSocketServerHelper({
      ...base(),
      requireEncryption: true,
      authenticate: { schema: z.object({ token: z.string().trim() }), fn: authenticateFn },
      handshake: { fn: handshakeFn },
    });

    await authenticate({ helper, payload: { token: ' t ', extra: 1 } });

    expect(authenticateFn).toHaveBeenCalledWith({ token: 't' });
    expect(handshakeFn.mock.calls[0]?.[0].data).toEqual({ token: 't' });
  });

  test('with a schema, refuses what the schema refuses', async () => {
    const authenticateFn = mock((_data: { token: string }) => ({ userId: 'u' }));
    const helper = new WebSocketServerHelper({
      ...base(),
      authenticate: { schema: z.object({ token: z.string() }), fn: authenticateFn },
    });

    const client = await authenticate({ helper, payload: { token: 7 } });

    expect(authenticateFn).not.toHaveBeenCalled();
    expect(client.close).toHaveBeenCalledWith(4003, 'Authentication failed');
  });

  test('types hooks written inline from authenticate.schema', async () => {
    const seen: string[] = [];
    const helper = new WebSocketServerHelper({
      ...base(),
      requireEncryption: true,
      authenticate: {
        schema: z.object({ token: z.string() }),
        fn: (data) => {
          seen.push(data.token.toUpperCase());

          return { userId: data.token, metadata: { role: 'admin' } };
        },
      },
      handshake: { fn: (opts) => ({ serverPublicKey: opts.data.token.trim(), salt: 's' }) },
      clientConnectedFn: (opts) => {
        seen.push(opts.metadata?.role ?? 'none');
      },
    });

    await authenticate({ helper, payload: { token: 't' } });

    expect(seen).toEqual(['T', 'admin']);
  });

  test('types hooks written inline without a schema as a record', async () => {
    const seen: unknown[] = [];
    const helper = new WebSocketServerHelper({
      ...base(),
      authenticate: {
        fn: (data) => {
          // @ts-expect-error without a schema the data is a record of unknown
          const token: string = data.token;
          seen.push(token);

          return null;
        },
      },
    });

    await authenticate({ helper, payload: { token: 't' } });

    expect(seen).toEqual(['t']);
  });

  test('the socket handler takes a socket that carries its client id', () => {
    const helper = new WebSocketServerHelper({ ...base(), authenticate: { fn: () => null } });
    const handler = helper.getBunWebSocketHandler();

    helpers.push(helper);
    handler.open(socket());

    expect(helper.getClients({ id: 'c1' })).toBeDefined();
  });
});
