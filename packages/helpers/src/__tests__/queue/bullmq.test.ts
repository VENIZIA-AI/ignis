import { AnyType } from '@/common/types';
import { getError } from '@/modules/error';
import { BullMQHelper } from '@/modules/queue/bullmq';
import { Cluster } from 'ioredis';
import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

type TProcessor = (job: AnyType) => Promise<AnyType>;

/** Structural stand-in for a bullmq Queue/Worker - EventEmitter + close(). */
class FakeBullClient extends EventEmitter {
  closeCount = 0;
  closeError: Error | null = null;

  constructor(readonly queueName: string) {
    super();
  }

  async close(): Promise<void> {
    this.closeCount += 1;

    if (this.closeError) {
      throw this.closeError;
    }
  }
}

class FakeBullWorker extends FakeBullClient {
  constructor(
    queueName: string,
    readonly processor: TProcessor,
  ) {
    super(queueName);
  }
}

class TestBullMQHelper extends BullMQHelper<AnyType, AnyType> {
  protected override buildQueue(opts: { queueName: string }): AnyType {
    return new FakeBullClient(opts.queueName);
  }

  protected override buildWorker(opts: { queueName: string; processor: AnyType }): AnyType {
    return new FakeBullWorker(opts.queueName, opts.processor);
  }
}

const buildRedisConnection = (opts?: { client?: AnyType }): AnyType => {
  const client = opts?.client ?? {};

  return {
    getClient: () => client,
    duplicateClient: () => client,
  };
};

const buildJob = (opts?: { id?: string }): AnyType => {
  return { id: opts?.id ?? 'job-1', name: 'default', data: { value: 1 } };
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

describe('BullMQHelper — role dispatch, worker hooks, close', () => {
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

  test('role dispatch builds exactly one client', () => {
    const producer = new TestBullMQHelper({
      queueName: 'mail',
      identifier: 'producer',
      role: 'queue',
      redisConnection: buildRedisConnection(),
    });

    expect(producer.queue).toBeDefined();
    expect(producer.worker).toBeUndefined();

    const consumer = new TestBullMQHelper({
      queueName: 'mail',
      identifier: 'consumer',
      role: 'worker',
      redisConnection: buildRedisConnection(),
    });

    expect(consumer.worker).toBeDefined();
    expect(consumer.queue).toBeUndefined();
  });

  test('queue name is hash-tagged only on a Redis Cluster connection', () => {
    const cluster = new Cluster([{ host: '127.0.0.1', port: 7000 }], { lazyConnect: true });

    try {
      const plain = new TestBullMQHelper({
        queueName: 'mail',
        identifier: 'plain',
        role: 'queue',
        redisConnection: buildRedisConnection(),
      });
      const plainQueue: FakeBullClient = plain.queue as AnyType;
      expect(plainQueue.queueName).toBe('mail');

      const clustered = new TestBullMQHelper({
        queueName: 'mail',
        identifier: 'clustered',
        role: 'queue',
        redisConnection: buildRedisConnection({ client: cluster }),
      });
      const clusteredQueue: FakeBullClient = clustered.queue as AnyType;
      expect(clusteredQueue.queueName).toBe('{mail}');

      const preTagged = new TestBullMQHelper({
        queueName: '{mail}',
        identifier: 'pre-tagged',
        role: 'queue',
        redisConnection: buildRedisConnection({ client: cluster }),
      });
      const preTaggedQueue: FakeBullClient = preTagged.queue as AnyType;
      expect(preTaggedQueue.queueName).toBe('{mail}');
    } finally {
      cluster.disconnect();
    }
  });

  test('the worker processor delegates to onWorkerData and returns its result', async () => {
    const processed: AnyType[] = [];
    const helper = new TestBullMQHelper({
      queueName: 'mail',
      identifier: 'worker-processor',
      role: 'worker',
      redisConnection: buildRedisConnection(),
      onWorkerData: async job => {
        processed.push(job);
        return { ok: true };
      },
    });

    const worker: FakeBullWorker = helper.worker as AnyType;
    const result = await worker.processor(buildJob());

    expect(processed.length).toBe(1);
    expect(result).toEqual({ ok: true });
  });

  test('the worker processor falls back to logging when no onWorkerData is registered', async () => {
    const helper = new TestBullMQHelper({
      queueName: 'mail',
      identifier: 'worker-no-processor',
      role: 'worker',
      redisConnection: buildRedisConnection(),
    });

    const worker: FakeBullWorker = helper.worker as AnyType;
    expect(await worker.processor(buildJob())).toBeUndefined();
  });

  test('completed/failed hooks receive the job and are reported on rejection', async () => {
    const completed: AnyType[] = [];
    const failed: AnyType[] = [];

    const helper = new TestBullMQHelper({
      queueName: 'mail',
      identifier: 'worker-hooks',
      role: 'worker',
      redisConnection: buildRedisConnection(),
      onWorkerDataCompleted: async (job, result) => {
        completed.push({ job, result });
      },
      onWorkerDataFail: async (job, error) => {
        failed.push({ job, error });
        throw new Error('fail-hook rejected'); // rejection must be logged, never unhandled
      },
    });

    const worker: FakeBullWorker = helper.worker as AnyType;
    worker.emit('completed', buildJob(), { ok: true });
    worker.emit('failed', buildJob({ id: 'job-2' }), new Error('job blew up'));

    await new Promise<void>(resolve => {
      setImmediate(resolve);
    });

    expect(completed.length).toBe(1);
    expect(failed.length).toBe(1);
    expect(unhandledRejections).toEqual([]);
  });

  test('BUG: SYNC-throwing completed/failed hooks must not escape the worker emitter', () => {
    const helper = new TestBullMQHelper({
      queueName: 'mail',
      identifier: 'worker-throwing-hooks',
      role: 'worker',
      redisConnection: buildRedisConnection(),
      onWorkerDataCompleted: (() => {
        throw new Error('completed-hook-boom');
      }) as AnyType,
      onWorkerDataFail: (() => {
        throw new Error('failed-hook-boom');
      }) as AnyType,
    });

    const worker: FakeBullWorker = helper.worker as AnyType;

    expect(() => worker.emit('completed', buildJob(), { ok: true })).not.toThrow();
    expect(() => worker.emit('failed', buildJob(), new Error('job blew up'))).not.toThrow();
  });

  test('BUG: a worker/queue driver error event must be handled, not crash the process', () => {
    const worker = new TestBullMQHelper({
      queueName: 'mail',
      identifier: 'worker-error-event',
      role: 'worker',
      redisConnection: buildRedisConnection(),
    });
    const queue = new TestBullMQHelper({
      queueName: 'mail',
      identifier: 'queue-error-event',
      role: 'queue',
      redisConnection: buildRedisConnection(),
    });

    const workerClient: FakeBullClient = worker.worker as AnyType;
    const queueClient: FakeBullClient = queue.queue as AnyType;

    // An 'error' event with no listener is re-thrown by EventEmitter — an uncaught exception that
    // takes the whole process down whenever the driver's Redis link hiccups.
    expect(() => {
      workerClient.emit('error', new Error('redis link lost'));
    }).not.toThrow();
    expect(() => {
      queueClient.emit('error', new Error('redis link lost'));
    }).not.toThrow();
  });

  test('BUG: close() must close the queue even when the worker close fails, and still report', async () => {
    const helper = new TestBullMQHelper({
      queueName: 'mail',
      identifier: 'close-both',
      role: 'worker',
      redisConnection: buildRedisConnection(),
    });

    // A worker-role helper only owns a worker; wire a queue in as well to pin the close ORDER contract.
    const worker: FakeBullClient = helper.worker as AnyType;
    const queue = new FakeBullClient('mail');
    helper.queue = queue as AnyType;

    worker.closeError = new Error('worker refused to close'); // raw driver error

    const rejection = await captureRejection({ promise: helper.close() });
    expect(rejection.message).toContain('worker refused to close');

    expect(worker.closeCount).toBe(1);
    expect(queue.closeCount).toBe(1); // the queue connection must NOT be leaked behind a failed worker close
  });

  test('close() closes both clients on the happy path', async () => {
    const helper = new TestBullMQHelper({
      queueName: 'mail',
      identifier: 'close-happy',
      role: 'worker',
      redisConnection: buildRedisConnection(),
    });

    const worker: FakeBullClient = helper.worker as AnyType;
    const queue = new FakeBullClient('mail');
    helper.queue = queue as AnyType;

    await helper.close();

    expect(worker.closeCount).toBe(1);
    expect(queue.closeCount).toBe(1);
  });
});
