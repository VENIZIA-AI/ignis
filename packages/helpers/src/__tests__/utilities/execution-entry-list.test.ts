import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';

/**
 * Every place the helpers register a listener or a timer, and the frame it runs in. An entry that opens no frame runs
 * in the frame of whoever started it, so a new registration is added here with its frame, or this test fails.
 */
const ENTRIES: Readonly<Record<string, { count: number; frame: string }>> = {
  'modules/cron/helper.ts': { count: 1, frame: 'tick, onComplete and errorHandler: root' },
  'modules/execution/execution.ts': {
    count: 2,
    frame: 'timers that resolve a promise of the caller: the caller frame',
  },
  'modules/logger/hf/flusher.ts': {
    count: 2,
    frame: 'flush interval: root; the yield inside a flush resolves the loop itself',
  },
  'modules/logger/winston/transports/dgram.transport.ts': {
    count: 2,
    frame: 'internal: no application code',
  },
  'modules/network/tcp-socket/base-tcp-client.helper.ts': {
    count: 5,
    frame: 'connect, data, close, error, reconnect: root',
  },
  'modules/network/tcp-socket/base-tcp-server.helper.ts': {
    count: 7,
    frame: 'connection, server error, data, close, error, extra events, auth timeout: root',
  },
  'modules/network/udp-socket/network-udp-client.helper.ts': {
    count: 4,
    frame: 'close, error, listening, message: root',
  },
  'modules/network/utilities/url-safety/guard.ts': {
    count: 1,
    frame: 'abort of a lookup the caller awaits: the caller frame',
  },
  'modules/pool/abstract.ts': {
    count: 1,
    frame: 'acquire timeout of one waiter: the waiter frame; the shared dispatch loop is root',
  },
  'modules/queue/bullmq/helper.ts': {
    count: 5,
    frame: 'completed, failed (and the processor): root; error and end only log',
  },
  'modules/queue/kafka/base.ts': {
    count: 4,
    frame: 'client events and a shutdown timer: not framed, they run no work of the application',
  },
  'modules/queue/kafka/consumer.ts': {
    count: 12,
    frame: 'each message and each error hook: root; client events are not framed',
  },
  'modules/queue/mqtt/helper.ts': {
    count: 5,
    frame: 'message: root; connect, disconnect, close, error are not framed',
  },
  'modules/redis/base/abstract.helper.ts': { count: 4, frame: 'connection state: not framed' },
  'modules/redis/utility.ts': {
    count: 3,
    frame: 'a ready wait the caller awaits: the caller frame',
  },
  'modules/secrets/base/abstract.helper.ts': {
    count: 1,
    frame: 'renewal timer: root, and so is each rotation handler',
  },
  'modules/socket/socket-io/server/helper.ts': {
    count: 12,
    frame:
      'connection, disconnect, authenticate, join, leave, on(), emit callback, timers: root; Redis errors only log',
  },
  'modules/socket/websocket/emitter/helper.ts': { count: 1, frame: 'Redis error: only logs' },
  'modules/socket/websocket/server/helper.ts': {
    count: 11,
    frame:
      'socket events (root with the client user), Redis fan-out, auth and heartbeat timers, emit callback: root',
  },
  'modules/worker-thread/bus/base.ts': { count: 5, frame: 'every port event: root' },
  'modules/worker-thread/worker/base.ts': { count: 5, frame: 'every worker event: root' },
  'utilities/retry.utility.ts': {
    count: 3,
    frame: 'backoff and timeout of work the caller awaits: the caller frame',
  },
};

const REGISTRATION =
  /\.(on|once|addListener|addEventListener|psubscribe)\(|\b(setTimeout|setInterval|setImmediate|createServerFn|createClientFn)\(|CronJob\.from\(|\bfor await \(/g;

const SOURCE = join(import.meta.dir, '../..');

const countRegistrations = async () => {
  const counts: Record<string, number> = {};

  for await (const path of new Bun.Glob('**/*.ts').scan({ cwd: SOURCE })) {
    if (path.startsWith('__tests__') || path.includes('socket-io/client')) {
      continue;
    }

    const text = await Bun.file(join(SOURCE, path)).text();
    const code = text.replace(/\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gm, '');
    const count = code.match(REGISTRATION)?.length ?? 0;

    if (count > 0) {
      counts[path] = count;
    }
  }

  return counts;
};

describe('the listener registrations of the helpers', () => {
  test('each is listed with the frame it runs in', async () => {
    const counts = await countRegistrations();
    const listed = Object.fromEntries(
      Object.entries(ENTRIES).map(([path, entry]) => [path, entry.count]),
    );

    expect(counts).toEqual(listed);
  });
});
