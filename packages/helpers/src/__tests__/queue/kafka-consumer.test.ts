import { AnyType } from '@/common/types';
import { KafkaConsumerHelper } from '@/modules/queue/kafka/consumer';
import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

type TCloseCallback = (error?: Error | null) => void;

/** Async-iterable stand-in for a `@platformatic/kafka` MessagesStream. */
class FakeMessagesStream extends EventEmitter {
  private readonly pending: AnyType[] = [];
  private wakeUp: (() => void) | null = null;

  isClosed = false;
  destroyCount = 0;

  async *[Symbol.asyncIterator](): AsyncGenerator<AnyType> {
    while (!this.isClosed) {
      const next = this.pending.shift();
      if (next !== undefined) {
        yield next;
        continue;
      }

      await new Promise<void>(resolve => {
        this.wakeUp = resolve;
      });
    }
  }

  push(opts: { message: AnyType }): void {
    this.pending.push(opts.message);
    this.release();
  }

  async close(): Promise<void> {
    this.isClosed = true;
    this.release();
  }

  destroy(_error?: Error): void {
    this.destroyCount += 1;
    this.isClosed = true;
    this.release();
  }

  private release(): void {
    const wakeUp = this.wakeUp;
    this.wakeUp = null;
    wakeUp?.();
  }
}

/** Structural stand-in for a `@platformatic/kafka` Consumer. */
class FakeConsumerClient extends EventEmitter {
  readonly consumeCalls: AnyType[] = [];
  readonly streams: FakeMessagesStream[] = [];
  readonly closeCalls: Array<{ isForce: boolean }> = [];

  isConsumeFailing = false;
  lagMonitoringStarts = 0;
  lagMonitoringStops = 0;

  async consume(opts: AnyType): Promise<FakeMessagesStream> {
    this.consumeCalls.push(opts);

    if (this.isConsumeFailing) {
      throw new Error('fake broker refused consume'); // raw driver error
    }

    const stream = new FakeMessagesStream();
    this.streams.push(stream);
    return stream;
  }

  startLagMonitoring(_opts: AnyType, _interval: number): void {
    this.lagMonitoringStarts += 1;
  }

  stopLagMonitoring(): void {
    this.lagMonitoringStops += 1;
  }

  isActive(): boolean {
    return true;
  }

  close(isForce?: boolean, callback?: TCloseCallback): Promise<void> | void {
    this.closeCalls.push({ isForce: isForce ?? false });

    if (callback) {
      callback(null);
      return;
    }

    return Promise.resolve();
  }
}

const buildHelper = (opts: {
  client: FakeConsumerClient;
  hooks?: Partial<AnyType>;
}): KafkaConsumerHelper<AnyType, AnyType, AnyType, AnyType> => {
  const helper = KafkaConsumerHelper.newInstance<AnyType, AnyType, AnyType, AnyType>({
    bootstrapBrokers: ['127.0.0.1:9092'],
    clientId: 'ignis-consumer-test',
    groupId: 'ignis-test-group',
    identifier: 'consumer-under-test',
    ...(opts.hooks ?? {}),
  });

  // The Consumer is built inside the constructor; swapClient is the supported seam for replacing it (it is what the reconnect path itself uses), so the fake gets the exact production wiring.
  helper['swapClient'](opts.client as AnyType);
  return helper;
};

const flush = async (): Promise<void> => {
  for (let index = 0; index < 4; index += 1) {
    await new Promise<void>(resolve => {
      setImmediate(resolve);
    });
  }
};

describe('KafkaConsumerHelper — lifecycle, hooks, shutdown', () => {
  const unhandledRejections: unknown[] = [];
  const onUnhandledRejection = (reason: unknown) => {
    unhandledRejections.push(reason);
  };

  beforeEach(() => {
    unhandledRejections.length = 0;
    process.on('unhandledRejection', onUnhandledRejection);
  });

  afterEach(() => {
    process.off('unhandledRejection', onUnhandledRejection);
  });

  test('start() consumes, delivers messages to onMessage/onMessageDone, and close() resolves', async () => {
    const client = new FakeConsumerClient();
    const received: AnyType[] = [];
    const done: AnyType[] = [];

    const helper = buildHelper({
      client,
      hooks: {
        onMessage: ({ message }: AnyType) => {
          received.push(message);
        },
        onMessageDone: ({ message }: AnyType) => {
          done.push(message);
        },
      },
    });

    await helper.start({ topics: ['orders'] });
    expect(client.consumeCalls.length).toBe(1);
    expect(helper.getStream()).not.toBeNull();

    client.streams[0].push({ message: { key: 'k1' } });
    await flush();

    expect(received).toEqual([{ key: 'k1' }]);
    expect(done).toEqual([{ key: 'k1' }]);

    await helper.start({ topics: ['orders'] }); // duplicate start is ignored
    expect(client.consumeCalls.length).toBe(1);

    await helper.close();
    expect(client.closeCalls.length).toBe(1);
    expect(helper.getStream()).toBeNull();
    expect(helper.isHealthy()).toBe(false);
  });

  test('a throwing message handler is reported through onMessageError and the loop keeps consuming', async () => {
    const client = new FakeConsumerClient();
    const received: AnyType[] = [];
    const errors: unknown[] = [];

    const helper = buildHelper({
      client,
      hooks: {
        onMessage: ({ message }: AnyType) => {
          received.push(message);

          if (message.key === 'bad') {
            throw new Error('handler boom'); // foreign handler failure
          }
        },
        onMessageError: ({ error }: AnyType) => {
          errors.push(error);
        },
      },
    });

    await helper.start({ topics: ['orders'] });

    client.streams[0].push({ message: { key: 'bad' } });
    client.streams[0].push({ message: { key: 'good' } });
    await flush();

    expect(received.map((message: AnyType) => message.key)).toEqual(['bad', 'good']);
    expect(errors.length).toBe(1);

    await helper.close();
    expect(unhandledRejections).toEqual([]);
  });

  test('BUG: a SYNC-throwing onMessageError must not escape the stream error listener', async () => {
    const client = new FakeConsumerClient();

    const helper = buildHelper({
      client,
      hooks: {
        onMessage: () => {},
        onMessageError: () => {
          throw new Error('message-error-hook-boom');
        },
      },
    });

    await helper.start({ topics: ['orders'] });
    const stream = client.streams[0];

    expect(() => {
      stream.emit('error', new Error('stream blew up')); // raw driver error
    }).not.toThrow();

    await helper.close();
  });

  test('BUG: SYNC-throwing consumer group/heartbeat/lag hooks must not escape the client emitter', async () => {
    const client = new FakeConsumerClient();

    const helper = buildHelper({
      client,
      hooks: {
        onGroupJoin: () => {
          throw new Error('group-join-hook-boom');
        },
        onGroupLeave: () => {
          throw new Error('group-leave-hook-boom');
        },
        onGroupRebalance: () => {
          throw new Error('group-rebalance-hook-boom');
        },
        onHeartbeatError: () => {
          throw new Error('heartbeat-hook-boom');
        },
        onLag: () => {
          throw new Error('lag-hook-boom');
        },
        onLagError: () => {
          throw new Error('lag-error-hook-boom');
        },
      },
    });

    expect(() => {
      client.emit('consumer:group:join', { groupId: 'g', memberId: 'm', generationId: 1 });
    }).not.toThrow();
    expect(() => {
      client.emit('consumer:group:leave', { groupId: 'g', memberId: 'm' });
    }).not.toThrow();
    expect(() => {
      client.emit('consumer:group:rebalance', { groupId: 'g' });
    }).not.toThrow();
    expect(() => {
      client.emit('consumer:heartbeat:error', {
        groupId: 'g',
        memberId: 'm',
        error: new Error('heartbeat failed'),
      });
    }).not.toThrow();
    expect(() => {
      client.emit('consumer:lag', {});
    }).not.toThrow();
    expect(() => {
      client.emit('consumer:lag:error', new Error('lag failed'));
    }).not.toThrow();

    await helper.close();
    expect(unhandledRejections).toEqual([]);
  });

  test('lag monitoring starts once, stops on close, and is not restarted afterwards', async () => {
    const client = new FakeConsumerClient();
    const helper = buildHelper({ client, hooks: { onMessage: () => {} } });

    helper.startLagMonitoring({ topics: ['orders'] });
    helper.startLagMonitoring({ topics: ['orders'] }); // duplicate is ignored
    expect(client.lagMonitoringStarts).toBe(1);

    await helper.start({ topics: ['orders'] });
    await helper.close();

    expect(client.lagMonitoringStops).toBe(1);

    helper.stopLagMonitoring(); // already stopped → no extra driver call
    expect(client.lagMonitoringStops).toBe(1);
  });

  test('all brokers disconnecting destroys the stream, and the consume loop reconnects', async () => {
    const client = new FakeConsumerClient();
    const helper = buildHelper({ client, hooks: { onMessage: () => {} } });

    await helper.start({ topics: ['orders'], reconnectDelayMs: 5, maxReconnectAttempts: 3 });
    client.emit('client:broker:connect', { broker: { host: 'a', port: 9092 } });

    const firstStream = client.streams[0];
    client.emit('client:broker:disconnect', { broker: { host: 'a', port: 9092 } });

    expect(firstStream.destroyCount).toBeGreaterThanOrEqual(1);

    await flush();
    await helper.close(); // must resolve even though the loop is mid-reconnect
    expect(unhandledRejections).toEqual([]);
  });

  test('close() resolves while the consume loop is sleeping between reconnect attempts', async () => {
    const client = new FakeConsumerClient();
    const helper = buildHelper({
      client,
      hooks: { onMessage: () => {}, onMessageError: () => {} },
    });

    await helper.start({ topics: ['orders'], reconnectDelayMs: 10, maxReconnectAttempts: 5 });

    client.isConsumeFailing = true;
    client.streams[0].destroy(); // kill the stream → loop enters the reconnect backoff

    await helper.close();

    const consumeCallsAtClose = client.consumeCalls.length;
    await flush();

    expect(client.consumeCalls.length).toBe(consumeCallsAtClose); // no reconnect after shutdown
    expect(helper.getStream()).toBeNull();
    expect(unhandledRejections).toEqual([]);
  });
});
