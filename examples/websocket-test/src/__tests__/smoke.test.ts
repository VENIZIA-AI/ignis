// Smoke test: boots the real application on a free port, connects raw WebSocket clients over the
// real wire, and exercises authentication, Redis-backed room delivery, and rejection. Skipped when
// Redis is unreachable - `docker compose up -d` starts the Redis this example (and this test)
// expect on localhost:16381.
import { z } from '@hono/zod-openapi';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { WebSocketDefaults } from '@venizia/ignis-helpers';
import { Application } from '../application';

const HOST = '127.0.0.1';
const REDIS_HOST = process.env.APP_ENV_REDIS_HOST ?? 'localhost';
const REDIS_PORT = Number(process.env.APP_ENV_REDIS_PORT ?? 16381);
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
const WireMessageSchema = z.object({ event: z.string(), data: z.unknown().optional() });
const ChatMessageDataSchema = z.object({ message: z.string() });

const parseMessage = (raw: unknown) => WireMessageSchema.parse(JSON.parse(String(raw)));

/** Connects and authenticates; resolves the socket once the server confirms it with `connected`. */
const connectAuthenticated = (opts: { wsUrl: string; token: string }) =>
  new Promise<WebSocket>((resolve, reject) => {
    const socket = new WebSocket(opts.wsUrl);

    socket.addEventListener('open', () => {
      socket.send(JSON.stringify({ event: 'authenticate', data: { token: opts.token } }));
    });
    socket.addEventListener('message', event => {
      const message = parseMessage(event.data);
      if (message.event === 'connected') {
        resolve(socket);
      }
    });
    socket.addEventListener('error', () => reject(new Error('WebSocket connection error')));
  });

/** Connects with no valid token and resolves with the close code the server sent. */
const connectRejected = (opts: { wsUrl: string }) =>
  new Promise<number>((resolve, reject) => {
    const socket = new WebSocket(opts.wsUrl);

    socket.addEventListener('open', () => {
      socket.send(JSON.stringify({ event: 'authenticate', data: { token: 'wrong-token' } }));
    });
    socket.addEventListener('message', event => {
      const message = parseMessage(event.data);
      if (message.event === 'connected') {
        reject(new Error('expected authentication to fail'));
      }
    });
    socket.addEventListener('close', event => resolve(event.code));
    socket.addEventListener('error', () => reject(new Error('WebSocket connection error')));
  });

describe('websocket-test', () => {
  let application: Application;
  let apiUrl = '';
  let wsUrl = '';

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

    const port = application.getServerPort();
    apiUrl = `http://${HOST}:${port}/api`;
    wsUrl = `ws://${HOST}:${port}${WebSocketDefaults.PATH}`;
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
      const socket = await connectAuthenticated({ wsUrl, token: AUTH_TOKEN });

      try {
        const received = new Promise<{ message: string }>(resolve => {
          socket.addEventListener('message', event => {
            const message = parseMessage(event.data);
            if (message.event === 'chat:message') {
              resolve(ChatMessageDataSchema.parse(message.data));
            }
          });
        });

        const response = await fetch(`${apiUrl}/chat/messages`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ message: 'hello lobby' }),
        });
        expect(response.status).toBe(200);
        expect(MessageResponse.parse(await response.json())).toEqual({
          sent: true,
          room: WebSocketDefaults.ROOM,
        });

        const data = await received;
        expect(data.message).toBe('hello lobby');
      } finally {
        socket.close();
      }
    },
  );

  test.skipIf(!redisReachable)('an unauthenticated client is refused', async () => {
    const code = await connectRejected({ wsUrl });
    expect(code).toBe(4003);
  });
});
