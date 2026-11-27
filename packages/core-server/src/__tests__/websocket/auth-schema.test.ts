import 'reflect-metadata';

import { BaseApplication } from '@/base/applications';
import { WebSocketBindingKeys, WebSocketComponent } from '@/components/websocket';
import { z } from '@hono/zod-openapi';
import { AbstractRedisHelper, type TRedisClient } from '@venizia/ignis-helpers';
import type { ValueOrPromise } from '@venizia/ignis-helpers/common';
import type { IApplicationInfo } from '@venizia/ignis-kernel';
import { afterEach, describe, expect, test } from 'bun:test';
import { EventEmitter } from 'node:events';

class FakeRedisClient extends EventEmitter {
  status = 'ready';
  subscribe = async () => 1;
  psubscribe = async () => 1;
  unsubscribe = async () => 1;
  punsubscribe = async () => 1;
  publish = async () => 1;
  quit = async () => 'OK';
  disconnect = () => {};
}

const toRedisClient = (client: FakeRedisClient): TRedisClient => {
  const isRedisClient = (value: unknown): value is TRedisClient => value instanceof EventEmitter;

  if (!isRedisClient(client)) {
    throw new Error('the fake is not an event emitter');
  }

  return client;
};

class FakeRedisHelper extends AbstractRedisHelper {
  constructor() {
    super({ scope: 'FakeRedis', identifier: 'fake', client: toRedisClient(new FakeRedisClient()) });
  }

  override duplicateClient(): TRedisClient {
    return toRedisClient(new FakeRedisClient());
  }
}

const received: unknown[] = [];

class SocketApplication extends BaseApplication {
  getAppInfo(): ValueOrPromise<IApplicationInfo> {
    return { name: 'socket-app', version: '0.0.0', description: 'WebSocket authentication probe' };
  }

  staticConfigure(): void {}

  preConfigure(): void {
    this.bind({ key: WebSocketBindingKeys.REDIS_CONNECTION }).toValue(new FakeRedisHelper());
    this.bind({ key: WebSocketBindingKeys.AUTH_SCHEMA }).toValue(z.object({ token: z.string() }));
    this.bind({ key: WebSocketBindingKeys.AUTHENTICATE_HANDLER }).toValue((data) => {
      received.push(data);

      return { userId: 'u' };
    });
    this.component(WebSocketComponent);
  }

  postConfigure(): void {}
  setupMiddlewares(): void {}
}

let application: SocketApplication | undefined;

afterEach(async () => {
  await application?.stop();
});

/** Sends one `authenticate` message and answers the first thing the server does about it. */
const authenticate = (opts: { port: number; data: unknown }) => {
  const { promise, resolve } = Promise.withResolvers<string>();
  const socket = new WebSocket(`ws://127.0.0.1:${opts.port}/ws`);

  socket.onopen = () => socket.send(JSON.stringify({ event: 'authenticate', data: opts.data }));

  socket.onmessage = (message) => {
    if (!String(message.data).includes('"connected"')) {
      return;
    }

    resolve('connected');
    socket.close();
  };

  socket.onclose = (event) => resolve(`closed ${event.code}`);

  return promise;
};

describe('WebSocketComponent, AUTH_SCHEMA', () => {
  test('checks the authentication data before the handler receives it', async () => {
    application = new SocketApplication({
      scope: SocketApplication.name,
      config: { host: '127.0.0.1', port: 0, path: { base: '/', isStrict: true } },
    });
    application.init();
    await application.start();
    const port = application.getServerInstance()?.port ?? 0;

    const refused = await authenticate({ port, data: { token: 7 } });
    const accepted = await authenticate({ port, data: { token: 't', extra: true } });

    expect(refused).toBe('closed 4003');
    expect(accepted).toBe('connected');
    expect(received).toEqual([{ token: 't' }]);
  });
});
