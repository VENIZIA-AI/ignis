import { AnyType } from '@/common/types';
import { getError } from '@/modules/error';
import { IMQTTClientOptions, MQTTClientHelper } from '@/modules/queue/mqtt';
import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

type TDriverCallback = (error?: Error | null) => void;

/** Structural stand-in for an `mqtt` client - no broker, no sockets, no reconnect timers. */
class FakeMqttClient extends EventEmitter {
  connected = false;
  endCalls: Array<{ isForce: boolean }> = [];

  subscribeError: Error | null = null;
  publishError: Error | null = null;
  isEndHanging = false;

  readonly subscribed: string[] = [];
  readonly published: Array<{ topic: string; message: string | Buffer }> = [];

  subscribe(topics: string[], callback: TDriverCallback): void {
    this.subscribed.push(...topics);
    callback(this.subscribeError);
  }

  publish(topic: string, message: string | Buffer, callback: TDriverCallback): void {
    this.published.push({ topic, message });
    callback(this.publishError);
  }

  end(isForce?: boolean, _options?: AnyType, callback?: () => void): void {
    this.endCalls.push({ isForce: isForce ?? false });
    this.connected = false;

    if (this.isEndHanging) {
      return;
    }

    callback?.();
  }
}

class TestMQTTClientHelper extends MQTTClientHelper {
  // A getter, not a field: the base constructor calls configure() before subclass fields initialize.
  get fakeClient(): FakeMqttClient {
    return this.getClient() as AnyType;
  }

  protected override createClient(): AnyType {
    return new FakeMqttClient();
  }
}

const buildHelper = (opts?: Partial<IMQTTClientOptions>): TestMQTTClientHelper => {
  return new TestMQTTClientHelper({
    identifier: 'mqtt-under-test',
    url: 'mqtt://fake-broker:1883',
    options: {},
    onMessage: () => {},
    ...(opts ?? {}),
  });
};

const flush = async (): Promise<void> => {
  await new Promise<void>(resolve => {
    setImmediate(resolve);
  });
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

describe('MQTTClientHelper — hooks, subscribe/publish guards, teardown', () => {
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

  test('configure() rejects an empty url', () => {
    expect(() => buildHelper({ url: '' })).toThrow('Invalid url to configure mqtt client');
  });

  test('every declared hook is wired to its driver event', () => {
    const calls: string[] = [];
    const messages: Array<{ topic: string; message: Buffer }> = [];
    const errors: Error[] = [];
    const closes: Array<Error | undefined> = [];

    const helper = buildHelper({
      onConnect: () => calls.push('connect'),
      onDisconnect: () => calls.push('disconnect'),
      onMessage: payload => messages.push(payload),
      onError: error => errors.push(error),
      onClose: error => closes.push(error),
    });

    const client = helper.fakeClient;
    client.emit('connect');
    client.emit('disconnect');
    client.emit('message', 'topic-a', Buffer.from('hello'));
    client.emit('error', new Error('driver blew up')); // raw driver error
    client.emit('close');

    expect(calls).toEqual(['connect', 'disconnect']);
    expect(messages.length).toBe(1);
    expect(messages[0].topic).toBe('topic-a');
    expect(messages[0].message.toString()).toBe('hello');
    expect(errors.map(error => error.message)).toEqual(['driver blew up']);
    expect(closes).toEqual([undefined]);
  });

  test('BUG: a SYNC-throwing hook must not escape the driver emitter', () => {
    const helper = buildHelper({
      onConnect: () => {
        throw new Error('connect-hook-boom');
      },
      onDisconnect: () => {
        throw new Error('disconnect-hook-boom');
      },
      onMessage: () => {
        throw new Error('message-hook-boom');
      },
      onError: () => {
        throw new Error('error-hook-boom');
      },
      onClose: () => {
        throw new Error('close-hook-boom');
      },
    });

    const client = helper.fakeClient;

    expect(() => client.emit('connect')).not.toThrow();
    expect(() => client.emit('disconnect')).not.toThrow();
    expect(() => client.emit('message', 'topic-a', Buffer.from('x'))).not.toThrow();
    expect(() => client.emit('error', new Error('driver blew up'))).not.toThrow();
    expect(() => client.emit('close')).not.toThrow();
  });

  test('subscribe/publish reject while disconnected and resolve once connected', async () => {
    const helper = buildHelper();
    const client = helper.fakeClient;

    const subscribeRejection = await captureRejection({
      promise: helper.subscribe({ topics: ['a'] }),
    });
    expect(subscribeRejection.message).toContain('MQTT Client is not available to subscribe topic');

    const publishRejection = await captureRejection({
      promise: helper.publish({ topic: 'a', message: 'x' }),
    });
    expect(publishRejection.message).toContain('MQTT Client is not available to publish message');

    client.connected = true;

    expect(await helper.subscribe({ topics: ['a', 'b'] })).toEqual(['a', 'b']);
    expect(client.subscribed).toEqual(['a', 'b']);

    expect(await helper.publish({ topic: 'a', message: 'x' })).toEqual({
      topic: 'a',
      message: 'x',
    });
    expect(client.published).toEqual([{ topic: 'a', message: 'x' }]);
  });

  test('subscribe/publish surface driver errors', async () => {
    const helper = buildHelper();
    const client = helper.fakeClient;
    client.connected = true;
    client.subscribeError = new Error('subscribe refused'); // raw driver error
    client.publishError = new Error('publish refused');

    const subscribeRejection = await captureRejection({
      promise: helper.subscribe({ topics: ['a'] }),
    });
    expect(subscribeRejection.message).toBe('subscribe refused');

    const publishRejection = await captureRejection({
      promise: helper.publish({ topic: 'a', message: 'x' }),
    });
    expect(publishRejection.message).toBe('publish refused');
  });

  test('close() ends the driver client, resolves, is idempotent, and disarms the helper', async () => {
    const helper = buildHelper();
    const client = helper.fakeClient;
    client.connected = true;

    await helper.close();

    expect(client.endCalls).toEqual([{ isForce: false }]);
    expect(helper.getClient()).toBeUndefined();

    await helper.close(); // second close must resolve, not hang nor double-end
    expect(client.endCalls.length).toBe(1);

    const rejection = await captureRejection({ promise: helper.subscribe({ topics: ['a'] }) });
    expect(rejection.message).toContain('MQTT Client is not available to subscribe topic');

    await flush();
    expect(unhandledRejections).toEqual([]);
  });

  test('close({ isForce: true }) forwards the force flag to the driver', async () => {
    const helper = buildHelper();
    const client = helper.fakeClient;
    client.connected = true;

    await helper.close({ isForce: true });
    expect(client.endCalls).toEqual([{ isForce: true }]);
  });

  test('configure() is idempotent - a second call keeps the existing client', () => {
    const helper = buildHelper();
    const client = helper.getClient();

    helper.configure();
    expect(helper.getClient()).toBe(client);
  });
});
