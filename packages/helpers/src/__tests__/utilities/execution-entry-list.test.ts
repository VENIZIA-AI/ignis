import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import ts from 'typescript';

/** A call that registers something to be run later. */
const METHODS = new Set([
  'addEventListener',
  'addListener',
  'on',
  'once',
  'prependListener',
  'psubscribe',
  'subscribe',
]);
const SCHEDULERS = new Set([
  'createClientFn',
  'createServerFn',
  'nextTick',
  'queueMicrotask',
  'setImmediate',
  'setInterval',
  'setTimeout',
]);

const calleeOf = (node: ts.CallExpression) => {
  const target = node.expression;

  if (ts.isIdentifier(target)) {
    return target.text;
  }

  return ts.isPropertyAccessExpression(target) ? target.name.text : '';
};

/** Whether the call hands over something to run: a method needs a function among its arguments, or two of them. */
const isRegistration = (node: ts.CallExpression, file: ts.SourceFile) => {
  const name = calleeOf(node);

  if (SCHEDULERS.has(name)) {
    return true;
  }

  if (node.expression.getText(file) === 'CronJob.from') {
    return true;
  }

  const hasFunction = node.arguments.some(
    (item) => ts.isArrowFunction(item) || ts.isFunctionExpression(item),
  );

  return METHODS.has(name) && (hasFunction || node.arguments.length > 1);
};

const scan = (opts: { path: string; text: string }) => {
  const file = ts.createSourceFile(opts.path, opts.text, ts.ScriptTarget.Latest, true);
  const unframed: string[] = [];

  const visit = (node: ts.Node): void => {
    const isLoop = ts.isForOfStatement(node) && node.awaitModifier !== undefined;
    const isCall = ts.isCallExpression(node) && isRegistration(node, file);

    if ((isLoop || isCall) && !node.getText(file).includes('ExecutionFrames.')) {
      let key = 'for await';

      if (ts.isCallExpression(node)) {
        const [first] = node.arguments;
        const event =
          first && ts.isStringLiteralLike(first)
            ? first.text
            : first && ts.isPropertyAccessExpression(first)
              ? first.name.text
              : '';
        key = `${calleeOf(node)}(${event})`;
      }

      unframed.push(`${opts.path} | ${key}`);
    }

    ts.forEachChild(node, visit);
  };

  visit(file);

  return unframed;
};

/**
 * The registrations that open no frame, each with why. Any other listener, timer or hand-off must open one through
 * `ExecutionFrames` in the call itself: it would otherwise run with the rights of whoever started it.
 */
const UNFRAMED: Readonly<Record<string, { count: number; reason: string }>> = {
  'core-server/base/applications/server.ts | on()': {
    count: 1,
    reason: 'process signals: not framed, shutdown runs no request work',
  },
  'core-server/base/applications/server.ts | setTimeout()': {
    count: 1,
    reason: 'stop timeout the caller awaits',
  },
  'core-server/base/controllers/grpc/adapter.ts | addEventListener(abort)': {
    count: 1,
    reason: 'internal: forwards the shutdown signal',
  },
  'core-server/base/controllers/grpc/adapter.ts | on(allowedMethods)': {
    count: 1,
    reason: 'not a registration',
  },
  'core-server/base/controllers/grpc/native/listener.helper.ts | on(connection)': {
    count: 1,
    reason: 'internal bookkeeping',
  },
  'core-server/base/controllers/grpc/native/listener.helper.ts | on(error)': {
    count: 1,
    reason: 'logs only',
  },
  'core-server/base/controllers/grpc/native/listener.helper.ts | on(session)': {
    count: 1,
    reason: 'internal bookkeeping',
  },
  'core-server/base/controllers/grpc/native/listener.helper.ts | once(aborted)': {
    count: 1,
    reason: 'internal: aborts the call signal',
  },
  'core-server/base/controllers/grpc/native/listener.helper.ts | once(close)': {
    count: 2,
    reason: 'internal bookkeeping',
  },
  'core-server/base/controllers/grpc/native/listener.helper.ts | once(error)': {
    count: 1,
    reason: 'a bind failure the caller awaits',
  },
  'core-server/base/controllers/grpc/native/listener.helper.ts | setTimeout()': {
    count: 1,
    reason: 'stream timeout, internal',
  },
  'core-server/base/controllers/grpc/native/native.writer.ts | setImmediate()': {
    count: 1,
    reason: 'resets a refused stream',
  },
  'core-server/base/controllers/grpc/timeout.guard.ts | setTimeout()': {
    count: 1,
    reason: 'sets a timeout on the connection',
  },
  'core-server/components/mail/helpers/executors/internal-queue-executor.helper.ts | setTimeout()':
    { count: 2, reason: 'feeds the sequential queue, which hands off' },
  'core-server/components/mail/utilities/attachment.utility.ts | for await': {
    count: 1,
    reason: 'reads a stream the caller awaits',
  },
  'core-server/components/static-asset/models/base.model.ts | on(principalType)': {
    count: 1,
    reason: 'not a registration',
  },
  'helpers/modules/execution/execution.ts | setTimeout()': {
    count: 2,
    reason: 'timers the caller awaits',
  },
  'helpers/modules/logger/hf/flusher.ts | setImmediate()': {
    count: 1,
    reason: 'yield inside a flush that is already framed',
  },
  'helpers/modules/logger/winston/transports/dgram.transport.ts | on(error)': {
    count: 1,
    reason: 'logs only',
  },
  'helpers/modules/logger/winston/transports/dgram.transport.ts | setImmediate()': {
    count: 1,
    reason: 'internal event of the transport',
  },
  'helpers/modules/network/utilities/url-safety/guard.ts | addEventListener(abort)': {
    count: 1,
    reason: 'abort of a lookup the caller awaits',
  },
  'helpers/modules/pool/abstract.ts | setTimeout()': {
    count: 1,
    reason: 'acquire timeout of one waiter',
  },
  'helpers/modules/queue/bullmq/helper.ts | on(error)': { count: 2, reason: 'logs only' },
  'helpers/modules/queue/bullmq/helper.ts | once(end)': {
    count: 1,
    reason: 'internal bookkeeping',
  },
  'helpers/modules/queue/kafka/base.ts | on(BROKER_CONNECT)': {
    count: 1,
    reason: 'client events: not framed, no work of the application',
  },
  'helpers/modules/queue/kafka/base.ts | on(BROKER_DISCONNECT)': {
    count: 1,
    reason: 'client events: not framed',
  },
  'helpers/modules/queue/kafka/base.ts | on(BROKER_FAILED)': {
    count: 1,
    reason: 'client events: not framed',
  },
  'helpers/modules/queue/kafka/base.ts | setTimeout()': {
    count: 1,
    reason: 'shutdown timeout the caller awaits',
  },
  'helpers/modules/queue/kafka/consumer.ts | on(BROKER_DISCONNECT)': {
    count: 1,
    reason: 'client events: not framed',
  },
  'helpers/modules/queue/kafka/consumer.ts | on(BROKER_FAILED)': {
    count: 1,
    reason: 'client events: not framed',
  },
  'helpers/modules/queue/kafka/consumer.ts | on(CONSUMER_GROUP_JOIN)': {
    count: 1,
    reason: 'client events: not framed',
  },
  'helpers/modules/queue/kafka/consumer.ts | on(CONSUMER_GROUP_LEAVE)': {
    count: 1,
    reason: 'client events: not framed',
  },
  'helpers/modules/queue/kafka/consumer.ts | on(CONSUMER_GROUP_REBALANCE)': {
    count: 1,
    reason: 'client events: not framed',
  },
  'helpers/modules/queue/kafka/consumer.ts | on(CONSUMER_HEARTBEAT_ERROR)': {
    count: 1,
    reason: 'client events: not framed',
  },
  'helpers/modules/queue/kafka/consumer.ts | on(CONSUMER_LAG)': {
    count: 1,
    reason: 'client events: not framed',
  },
  'helpers/modules/queue/kafka/consumer.ts | on(CONSUMER_LAG_ERROR)': {
    count: 1,
    reason: 'client events: not framed',
  },
  'helpers/modules/queue/kafka/consumer.ts | on(STREAM_ERROR)': {
    count: 2,
    reason: 'reported through reportStreamError, which frames the hook',
  },
  'helpers/modules/queue/kafka/consumer.ts | setTimeout()': {
    count: 1,
    reason: 'shutdown timeout the caller awaits',
  },
  'helpers/modules/queue/mqtt/helper.ts | on(close)': {
    count: 1,
    reason: 'connection state: not framed',
  },
  'helpers/modules/queue/mqtt/helper.ts | on(connect)': {
    count: 1,
    reason: 'connection state: not framed',
  },
  'helpers/modules/queue/mqtt/helper.ts | on(disconnect)': {
    count: 1,
    reason: 'connection state: not framed',
  },
  'helpers/modules/queue/mqtt/helper.ts | on(error)': {
    count: 1,
    reason: 'connection state: not framed',
  },
  'helpers/modules/queue/mqtt/helper.ts | subscribe()': {
    count: 1,
    reason: 'acknowledgement of the subscribe: logs only',
  },
  'helpers/modules/redis/base/abstract.helper.ts | on(connect)': {
    count: 1,
    reason: 'connection state: not framed',
  },
  'helpers/modules/redis/base/abstract.helper.ts | on(error)': {
    count: 1,
    reason: 'connection state: not framed',
  },
  'helpers/modules/redis/base/abstract.helper.ts | on(ready)': {
    count: 1,
    reason: 'connection state: not framed',
  },
  'helpers/modules/redis/base/abstract.helper.ts | on(reconnecting)': {
    count: 1,
    reason: 'connection state: not framed',
  },
  'helpers/modules/redis/base/abstract.helper.ts | subscribe()': {
    count: 1,
    reason: 'acknowledgement: logs only; an application frames its own message listener',
  },
  'helpers/modules/redis/utility.ts | once(error)': {
    count: 1,
    reason: 'a ready wait the caller awaits',
  },
  'helpers/modules/redis/utility.ts | once(ready)': {
    count: 1,
    reason: 'a ready wait the caller awaits',
  },
  'helpers/modules/redis/utility.ts | setTimeout()': {
    count: 1,
    reason: 'a ready wait the caller awaits',
  },
  'helpers/modules/secrets/base/abstract.helper.ts | setTimeout()': {
    count: 1,
    reason: 'the injected timer; the handler it gets is a framed listener',
  },
  'helpers/modules/socket/socket-io/server/helper.ts | on(error)': {
    count: 3,
    reason: 'Redis errors: log only',
  },
  'helpers/modules/socket/websocket/emitter/helper.ts | on(error)': {
    count: 1,
    reason: 'Redis errors: log only',
  },
  'helpers/modules/socket/websocket/server/helper.ts | on(error)': {
    count: 2,
    reason: 'Redis errors: log only',
  },
  'helpers/utilities/retry.utility.ts | addEventListener(abort)': {
    count: 1,
    reason: 'abort of work the caller awaits',
  },
  'helpers/utilities/retry.utility.ts | setTimeout()': {
    count: 2,
    reason: 'backoff and timeout of work the caller awaits',
  },
  'kernel/base/datasources/root.ts | setTimeout()': {
    count: 1,
    reason: 'close timeout the caller awaits',
  },
  'kernel/base/events/event-bus.ts | queueMicrotask()': {
    count: 1,
    reason: 'runs the handler through the hand-off captured at publish',
  },
};

const PACKAGES = join(import.meta.dir, '../../../..');

const unframedRegistrations = async () => {
  const counts: Record<string, number> = {};

  for (const name of ['core-server', 'helpers', 'kernel']) {
    const source = join(PACKAGES, name, 'src');

    for await (const path of new Bun.Glob('**/*.{ts,tsx}').scan({ cwd: source })) {
      if (path.startsWith('__tests__') || path.includes('socket-io/client')) {
        continue;
      }

      const text = await Bun.file(join(source, path)).text();

      for (const key of scan({ path: `${name}/${path}`, text })) {
        counts[key] = (counts[key] ?? 0) + 1;
      }
    }
  }

  return counts;
};

describe('the listener registrations of the framework', () => {
  test('each opens an execution frame, or is listed with why it does not', async () => {
    const counts = await unframedRegistrations();
    const listed = Object.fromEntries(
      Object.entries(UNFRAMED).map(([key, entry]) => [key, entry.count]),
    );

    expect(counts).toEqual(listed);
  });

  test('the scan sees an unframed listener, whatever registers it', () => {
    const text = [
      "client.on('message', (message) => handle(message));",
      'queueMicrotask(() => handle());',
      'process.nextTick(handle);',
      'stream.subscribe((value) => handle(value));',
      "client.on('message', (m) => ExecutionFrames.root({ task: () => handle(m) }));",
    ].join('\n');

    expect(scan({ path: 'a.ts', text })).toEqual([
      'a.ts | on(message)',
      'a.ts | queueMicrotask()',
      'a.ts | nextTick()',
      'a.ts | subscribe()',
    ]);
  });
});
