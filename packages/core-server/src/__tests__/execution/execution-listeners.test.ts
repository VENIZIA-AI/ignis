import { ExecutionRunner } from '@/base/execution';
import { Execution, ExecutionModes } from '@/helpers';
import { Container, EventBus, EventHandlerTypes } from '@venizia/ignis-kernel';
import { NetworkTcpServer, SequentialQueueHelper } from '@venizia/ignis-helpers';
import { CronHelper } from '@venizia/ignis-helpers/cron';
import { ExecutionFrames } from '@venizia/ignis-helpers/core';
import { BaseWorkerBusHelper } from '@venizia/ignis-helpers';
import { describe, expect, test } from 'bun:test';
import { connect } from 'node:net';
import { MessageChannel } from 'node:worker_threads';

ExecutionRunner.install();

const request = { get: () => undefined };

/** Registers and drives from the worst place: a system frame inside a request, with a user and a value. */
const fromSystem = <Result>(task: () => Result) =>
  ExecutionFrames.run({
    frame: {
      mode: ExecutionModes.SYSTEM,
      reason: 'starter',
      request,
      userId: 'starter',
      values: {},
    },
    task,
  });

const ROOT = { mode: ExecutionModes.SCOPED, values: {} };

/** A promise and the call that settles it. */
const gate = <Value>() => {
  const holder: { open: (value: Value) => void } = { open: () => {} };
  const opened = new Promise<Value>((resolve) => (holder.open = resolve));

  return { opened, open: (value: Value) => holder.open(value) };
};

describe('listeners start from a root frame', () => {
  test('a cron tick', async () => {
    const seen = gate<unknown>();
    const job = fromSystem(
      () => new CronHelper({ cronTime: '0 0 1 1 *', onTick: () => seen.open(Execution.current()) }),
    );
    await fromSystem(() => job.instance.fireOnTick());
    const frame = await seen.opened;

    expect(frame).toEqual(ROOT);
  });

  test('a worker bus message', async () => {
    const seen = gate<unknown>();
    const channel = new MessageChannel();
    fromSystem(
      () =>
        new BaseWorkerBusHelper({
          scope: 'probe',
          port: channel.port2,
          busHandler: {
            onMessage: () => seen.open(Execution.current()),
            onError: () => {},
            onExit: () => {},
            onClose: () => {},
          },
        }),
    );
    fromSystem(() => channel.port1.postMessage('ping'));
    const frame = await seen.opened;
    channel.port1.close();

    expect(frame).toEqual(ROOT);
  });

  test('a TCP connection and its data', async () => {
    const connected = gate<unknown>();
    const data = gate<unknown>();
    const server = fromSystem(
      () =>
        new NetworkTcpServer({
          identifier: 'probe',
          serverOptions: {},
          listenOptions: { port: 0, host: '127.0.0.1' },
          authenticateOptions: { required: false },
          onClientConnected: () => connected.open(Execution.current()),
          onClientData: () => data.open(Execution.current()),
        }),
    );
    const listening = gate<number>();
    const bound = Reflect.get(server, 'server');
    bound.once('listening', () => listening.open(bound.address().port));

    if (bound.listening) {
      listening.open(bound.address().port);
    }

    const port = await listening.opened;
    const socket = connect({ port, host: '127.0.0.1' }, () => socket.write('ping'));
    const frames = await Promise.all([connected.opened, data.opened]);
    socket.destroy();
    await server.shutdown();

    expect(frames).toEqual([ROOT, ROOT]);
  });
});

describe('hand-offs keep identity and drop rights', () => {
  test('a queued element: the user and values at enqueue, no request, in every hook', async () => {
    const seen: unknown[] = [];
    const done = gate<void>();

    const record = () => {
      seen.push(Execution.current());
    };

    const queue = fromSystem(
      () =>
        new SequentialQueueHelper<string>({
          identifier: 'frames',
          onMessage: record,
          onDataEnqueue: () => {},
          onDataDequeue: () => {
            record();
            done.open();
          },
        }),
    );
    await fromSystem(() => queue.enqueue('one'));
    await done.opened;

    expect(seen).toEqual([
      { ...ROOT, userId: 'starter' },
      { ...ROOT, userId: 'starter' },
    ]);
  });

  test('an element pushed straight into storage has no identity', async () => {
    const done = gate<unknown>();
    const queue = fromSystem(
      () =>
        new SequentialQueueHelper<string>({
          identifier: 'direct',
          autoDispatch: false,
          onMessage: () => done.open(Execution.current()),
        }),
    );
    queue.storage.push({ isLocked: false, payload: 'direct' });
    fromSystem(() => queue.nextMessage());

    const frame = await done.opened;

    expect(frame).toEqual(ROOT);
  });

  test('an event handler: the request and the identity of the publisher, without system rights', async () => {
    const done = gate<unknown>();
    const bus = new EventBus<{ probe: string }>({ container: new Container() });
    bus.register({
      name: 'probe',
      handler: { type: EventHandlerTypes.FUNCTION, fn: () => done.open(Execution.current()) },
    });
    fromSystem(() => bus.publish({ name: 'probe', payload: 'x' }));

    const frame = await done.opened;

    expect(frame).toEqual({ ...ROOT, request, userId: 'starter' });
  });
});
