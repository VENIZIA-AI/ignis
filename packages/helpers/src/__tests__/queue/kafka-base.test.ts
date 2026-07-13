import { AnyType } from '@/common/types';
import { getError, isApplicationError } from '@/modules/error';
import { KafkaHealthStatuses } from '@/modules/queue/kafka/common/constants';
import { BaseKafkaHelper } from '@/modules/queue/kafka/base';
import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

type TCloseCallback = (error?: Error | null) => void;

/** Structural stand-in for a `@platformatic/kafka` client - EventEmitter + the close() overloads. */
class FakeKafkaClient extends EventEmitter {
  closeCalls: Array<{ isForce: boolean }> = [];
  closeError: Error | null = null;
  isCloseHanging = false;

  close(isForce?: boolean, callback?: TCloseCallback): Promise<void> | void {
    this.closeCalls.push({ isForce: isForce ?? false });

    if (this.isCloseHanging) {
      if (callback) {
        return;
      }

      return new Promise<void>(() => {});
    }

    if (callback) {
      callback(this.closeError);
      return;
    }

    if (this.closeError) {
      return Promise.reject(this.closeError);
    }

    return Promise.resolve();
  }
}

class TestKafkaHelper extends BaseKafkaHelper<AnyType> {
  constructor(opts: {
    client: FakeKafkaClient;
    shutdownTimeout?: number;
    onBrokerConnect?: (opts: { broker: AnyType }) => void | Promise<void>;
    onBrokerDisconnect?: (opts: { broker: AnyType }) => void | Promise<void>;
  }) {
    super({
      scope: TestKafkaHelper.name,
      identifier: 'kafka-base-test',
      client: opts.client as AnyType,
      shutdownTimeout: opts.shutdownTimeout,
      onBrokerConnect: opts.onBrokerConnect,
      onBrokerDisconnect: opts.onBrokerDisconnect,
    });

    this.configureBrokerEvents();
  }

  swapTo(opts: { client: FakeKafkaClient }) {
    this.swapClient(opts.client as AnyType);
  }

  closeWithCallback(): Promise<void> {
    return this.closeClientWithCallback();
  }

  closeGracefully(): Promise<void> {
    return this.gracefulCloseClient();
  }
}

const brokerPayload = (opts: { host: string; port: number }) => {
  return { broker: { host: opts.host, port: opts.port } };
};

/** Awaits a rejection explicitly: bun's `expect(...).rejects` is typed as non-thenable in this repo. */
const captureRejection = async (opts: { promise: Promise<unknown> }): Promise<Error> => {
  const outcome = await opts.promise.then(
    () => null,
    (error: unknown) => error as Error,
  );

  if (!outcome) {
    throw getError({ message: 'Expected the promise to REJECT, but it resolved' });
  }

  return outcome;
};

describe('BaseKafkaHelper — broker events, health tracking, close paths', () => {
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

  test('broker connect/disconnect/failed drive health status and the connected-broker set', () => {
    const client = new FakeKafkaClient();
    const helper = new TestKafkaHelper({ client });

    expect(helper.getHealthStatus()).toBe(KafkaHealthStatuses.UNKNOWN);
    expect(helper.isHealthy()).toBe(false);
    expect(helper.isReady()).toBe(false);

    client.emit('client:broker:connect', brokerPayload({ host: 'a', port: 9092 }));
    client.emit('client:broker:connect', brokerPayload({ host: 'b', port: 9092 }));
    expect(helper.getConnectedBrokerCount()).toBe(2);
    expect(helper.isHealthy()).toBe(true);
    expect(helper.isReady()).toBe(true);

    client.emit('client:broker:disconnect', brokerPayload({ host: 'a', port: 9092 }));
    expect(helper.getConnectedBrokerCount()).toBe(1);
    expect(helper.getHealthStatus()).toBe(KafkaHealthStatuses.CONNECTED);

    client.emit('client:broker:failed', brokerPayload({ host: 'b', port: 9092 }));
    expect(helper.getConnectedBrokerCount()).toBe(0);
    expect(helper.getHealthStatus()).toBe(KafkaHealthStatuses.DISCONNECTED);
    expect(helper.isHealthy()).toBe(false);
  });

  test('BUG: a SYNC-throwing onBrokerConnect/onBrokerDisconnect must not escape the emitter', () => {
    const client = new FakeKafkaClient();
    const helper = new TestKafkaHelper({
      client,
      onBrokerConnect: () => {
        throw new Error('broker-connect-hook-boom'); // foreign hook, raw Error on purpose
      },
      onBrokerDisconnect: () => {
        throw new Error('broker-disconnect-hook-boom');
      },
    });

    expect(() => {
      client.emit('client:broker:connect', brokerPayload({ host: 'a', port: 9092 }));
    }).not.toThrow();
    expect(helper.getConnectedBrokerCount()).toBe(1);

    expect(() => {
      client.emit('client:broker:disconnect', brokerPayload({ host: 'a', port: 9092 }));
    }).not.toThrow();
    expect(helper.getConnectedBrokerCount()).toBe(0);
  });

  test('an async-rejecting broker hook is routed to the logger, never to an unhandled rejection', async () => {
    const client = new FakeKafkaClient();
    new TestKafkaHelper({
      client,
      onBrokerConnect: async () => {
        throw new Error('async-broker-hook-boom');
      },
    });

    client.emit('client:broker:connect', brokerPayload({ host: 'a', port: 9092 }));
    await new Promise<void>(resolve => {
      setImmediate(resolve);
    });

    expect(unhandledRejections).toEqual([]);
  });

  test('swapClient() detaches the old client and rewires events onto the new one', () => {
    const oldClient = new FakeKafkaClient();
    const newClient = new FakeKafkaClient();
    const helper = new TestKafkaHelper({ client: oldClient });

    oldClient.emit('client:broker:connect', brokerPayload({ host: 'a', port: 9092 }));
    expect(helper.getConnectedBrokerCount()).toBe(1);

    helper.swapTo({ client: newClient });

    expect(helper.getConnectedBrokerCount()).toBe(0);
    expect(helper.getHealthStatus()).toBe(KafkaHealthStatuses.DISCONNECTED);
    expect(oldClient.listenerCount('client:broker:connect')).toBe(0);

    oldClient.emit('client:broker:connect', brokerPayload({ host: 'a', port: 9092 }));
    expect(helper.getConnectedBrokerCount()).toBe(0); // stale client can no longer mutate health

    newClient.emit('client:broker:connect', brokerPayload({ host: 'c', port: 9092 }));
    expect(helper.getConnectedBrokerCount()).toBe(1);
  });

  test('closeClientWithCallback() resolves on success and REJECTS when the driver reports an error', async () => {
    const okClient = new FakeKafkaClient();
    const okHelper = new TestKafkaHelper({ client: okClient });

    await okHelper.closeWithCallback();
    expect(okClient.closeCalls).toEqual([{ isForce: true }]);

    const failingClient = new FakeKafkaClient();
    failingClient.closeError = new Error('driver refused to close'); // raw driver error
    const failingHelper = new TestKafkaHelper({ client: failingClient });

    const rejection = await captureRejection({ promise: failingHelper.closeWithCallback() });
    expect(rejection.message).toBe('driver refused to close');
  });

  test('BUG: gracefulCloseClient() must clear its timeout when close() wins the race', async () => {
    const shutdownTimeout = 987_654; // unique delay so only THIS helper timer is tracked
    const client = new FakeKafkaClient();
    const helper = new TestKafkaHelper({ client, shutdownTimeout });

    const originalSetTimeout = globalThis.setTimeout;
    const originalClearTimeout = globalThis.clearTimeout;
    const armedTimers = new Set<AnyType>();

    globalThis.setTimeout = ((handler: AnyType, delay?: number, ...args: AnyType[]) => {
      const timer = originalSetTimeout(handler, delay, ...args);
      if (delay === shutdownTimeout) {
        armedTimers.add(timer);
      }

      return timer;
    }) as AnyType;

    globalThis.clearTimeout = ((timer: AnyType) => {
      armedTimers.delete(timer);
      return originalClearTimeout(timer);
    }) as AnyType;

    try {
      await helper.closeGracefully();
    } finally {
      globalThis.setTimeout = originalSetTimeout;
      globalThis.clearTimeout = originalClearTimeout;
    }

    // A timer left armed here keeps the event loop alive for the whole shutdownTimeout after a
    // perfectly successful close - the process refuses to exit.
    expect(armedTimers.size).toBe(0);
  });

  test('gracefulCloseClient() rejects with an ApplicationError when the client close hangs', async () => {
    const client = new FakeKafkaClient();
    client.isCloseHanging = true;
    const helper = new TestKafkaHelper({ client, shutdownTimeout: 20 });

    const error = await helper.closeGracefully().catch((closeError: unknown) => closeError);

    expect(isApplicationError(error)).toBe(true);
    expect((error as Error).message).toContain('Shutdown timed out');
  });
});
