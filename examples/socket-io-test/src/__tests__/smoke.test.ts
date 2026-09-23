// Smoke test: boots the real application on a free port, connects Socket.IO clients over the real
// wire, and exercises authentication, Redis-backed room delivery, and rejection. Skipped when Redis
// is unreachable - `docker compose up -d` starts the Redis this example (and this test) expect on
// localhost:16380.
import { z } from '@hono/zod-openapi';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { SocketIOClientHelper, SocketIOConstants } from '@venizia/ignis-helpers/socket-io';
import { Application } from '../application';

const HOST = '127.0.0.1';
const REDIS_HOST = process.env.APP_ENV_REDIS_HOST ?? 'localhost';
const REDIS_PORT = Number(process.env.APP_ENV_REDIS_PORT ?? 16380);
const AUTH_TOKEN = process.env.APP_ENV_AUTH_TOKEN ?? 'demo-token';

/**
 * `describe`/`test.skipIf` need this decided before any `await` runs, and this file has no
 * `package.json` `"type": "module"` (nodenext then forbids top-level await) - so the probe itself
 * runs in a throwaway `bun -e` subprocess, which is exempt from that rule, and reports back via its
 * exit code.
 */
const isRedisReachable = (opts: { host: string; port: number }): boolean => {
  const probe = Bun.spawnSync({
    cmd: [
      'bun',
      '-e',
      `Promise.race([
        Bun.connect({
          hostname: ${JSON.stringify(opts.host)},
          port: ${opts.port},
          socket: { open: socket => socket.end(), data() {}, error() {} },
        }).then(() => true, () => false),
        new Promise(resolve => setTimeout(() => resolve(false), 1500)),
      ]).then(ok => process.exit(ok ? 0 : 1));`,
    ],
  });

  return probe.exitCode === 0;
};

const redisReachable = isRedisReachable({ host: REDIS_HOST, port: REDIS_PORT });

const MessageResponse = z.object({ sent: z.boolean(), room: z.string() });

/** Connects, authenticates, and resolves the client once the server confirms it. */
const connectAuthenticated = (opts: { baseUrl: string; token?: string }) =>
  new Promise<SocketIOClientHelper>((resolve, reject) => {
    const client: SocketIOClientHelper = new SocketIOClientHelper({
      identifier: 'smoke-authenticated',
      host: opts.baseUrl,
      options: {
        path: '/io',
        extraHeaders: opts.token ? { authorization: `Bearer ${opts.token}` } : {},
      },
      onConnected: () => client.authenticate(),
      onAuthenticated: () => resolve(client),
      onUnauthenticated: message => reject(new Error(message)),
      onError: error => reject(error),
    });
  });

/**
 * Connects with no valid token and resolves with the disconnect reason.
 *
 * The server's rejection path publishes `unauthenticated` through the Redis emitter, then
 * disconnects via `setImmediate` without waiting for that publish to round-trip back through the
 * adapter - the disconnect always wins the race, so the client never actually receives the
 * `unauthenticated` event (reproduced directly against this component, not just under `bun test`).
 * The disconnect itself is the reliable signal, so this asserts on that instead.
 */
const connectRejected = (opts: { baseUrl: string }) =>
  new Promise<string>((resolve, reject) => {
    const client: SocketIOClientHelper = new SocketIOClientHelper({
      identifier: 'smoke-rejected',
      host: opts.baseUrl,
      options: { path: '/io', extraHeaders: {} },
      onConnected: () => client.authenticate(),
      onAuthenticated: () => reject(new Error('expected authentication to fail')),
      onDisconnected: reason => resolve(reason),
      onError: error => reject(error),
    });
  });

describe('socket-io-test', () => {
  let application: Application;
  let baseUrl = '';
  let apiUrl = '';

  beforeAll(async () => {
    if (!redisReachable) {
      return;
    }

    application = new Application({
      scope: 'SmokeTest',
      config: {
        host: HOST,
        port: 0,
        path: { base: '/api', isStrict: false },
        discoverArtifacts: true,
      },
    });
    application.init();
    await application.start();

    baseUrl = `http://${HOST}:${application.getServerPort()}`;
    apiUrl = `${baseUrl}/api`;
  });

  afterAll(async () => {
    if (!redisReachable) {
      return;
    }
    await application.stop();
  });

  test.skipIf(!redisReachable)('GET /health answers', async () => {
    const response = await fetch(`${apiUrl}/health`);
    expect(response.status).toBe(200);
  });

  test.skipIf(!redisReachable)(
    'an authenticated client joins the default room and a message round-trips',
    async () => {
      const client = await connectAuthenticated({ baseUrl, token: AUTH_TOKEN });

      try {
        const received = new Promise<{ message: string }>(resolve => {
          client.subscribe({ event: 'chat:message', handler: resolve });
        });

        const response = await fetch(`${apiUrl}/chat/messages`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ message: 'hello lobby' }),
        });
        expect(response.status).toBe(200);
        expect(MessageResponse.parse(await response.json())).toEqual({
          sent: true,
          room: SocketIOConstants.ROOM_DEFAULT,
        });

        const data = await received;
        expect(data.message).toBe('hello lobby');
      } finally {
        client.shutdown();
      }
    },
  );

  test.skipIf(!redisReachable)('an unauthenticated client is refused', async () => {
    const reason = await connectRejected({ baseUrl });
    expect(reason).toBe('io server disconnect');
  });
});
