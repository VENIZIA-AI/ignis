import { describe, expect, test } from 'bun:test';
import { RejectionUtility } from '@venizia/dev-configs/testing';
import { Job, type JobsOptions, type Processor, type Queue, type Worker } from 'bullmq';
import { readFileSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { getError } from '@/modules/error';
import { BullMQHelper } from '@/modules/queue/bullmq';
import type { IRedisHelper } from '@/modules/redis';

/** The stamp, the prefix and `add` of `BullMQHelper`, on fakes: no Redis. */

interface IAdded {
  name: string;
  data: unknown;
  opts: JobsOptions | undefined;
}

class FakeQueue extends EventEmitter {
  added: IAdded[] = [];

  async add(name: string, data: unknown, opts?: JobsOptions) {
    this.added.push({ name, data, opts });

    return { id: `job-${this.added.length}`, name, data, opts };
  }

  async close() {}
}

class FakeWorker extends EventEmitter {
  constructor(readonly processor: Processor) {
    super();
  }

  async close() {}
}

const isQueue = (value: unknown): value is Queue => value instanceof FakeQueue;
const isWorker = (value: unknown): value is Worker => value instanceof FakeWorker;

class TestHelper<TMetadata extends object = Record<string, unknown>> extends BullMQHelper<
  unknown,
  unknown,
  TMetadata
> {
  // `declare`: a field initializer would run after the constructor that builds the queue.
  declare fakeQueue: FakeQueue;

  protected override buildQueue(): Queue {
    const queue = new FakeQueue();

    if (!isQueue(queue)) {
      throw getError({ message: 'the fake is not a queue' });
    }

    this.fakeQueue = queue;

    return queue;
  }

  protected override buildWorker(opts: { processor: Processor }): Worker {
    const worker = new FakeWorker(opts.processor);

    if (!isWorker(worker)) {
      throw getError({ message: 'the fake is not a worker' });
    }

    return worker;
  }

  /** The processor the helper handed to its worker. */
  readProcessor(): Processor {
    const { worker } = this;

    if (!(worker instanceof FakeWorker)) {
      throw getError({ message: 'no fake worker' });
    }

    return worker.processor;
  }

  exposeQueueOptions() {
    return this.queueOptionsFor({ queueName: 'q' });
  }

  exposeWorkerOptions() {
    return this.workerOptionsFor({ queueName: 'q', processor: async () => undefined });
  }

  exposeQueueName() {
    return this.resolveQueueName();
  }
}

/** The helper only reads `getClient()` and `duplicateClient()` off its redis connection. */
const isRedisHelperFake = (value: unknown): value is IRedisHelper =>
  typeof value === 'object' && value !== null && 'getClient' in value && 'duplicateClient' in value;

const redis = (opts?: { isCluster?: boolean }): IRedisHelper => {
  const client = Object.assign(new EventEmitter(), {
    status: 'ready',
    isCluster: opts?.isCluster ?? false,
    quit: async () => 'OK',
    disconnect: () => undefined,
  });
  const helper = { getClient: () => client, duplicateClient: () => client };

  if (!isRedisHelperFake(helper)) {
    throw getError({ message: 'the fake is not a redis helper' });
  }

  return helper;
};

/** BullMQ's `JobsOptions` is closed; the stamp is an option key it does not type. */
const withMetadata = (opts: JobsOptions, metadata: unknown): JobsOptions =>
  Object.assign({}, opts, { metadata });

const isJob = (value: unknown): value is Job =>
  typeof value === 'object' && value !== null && 'id' in value && 'data' in value;

const build = <TMetadata extends object = Record<string, unknown>>(
  options: Partial<ConstructorParameters<typeof TestHelper<TMetadata>>[0]> = {},
) =>
  new TestHelper<TMetadata>({
    queueName: 'mail',
    identifier: 'test',
    role: 'queue',
    redisConnection: redis(),
    ...options,
  });

describe('the metadata stamp', () => {
  test('goes to opts.metadata, and data is exactly what was added', async () => {
    const helper = build({ metadata: () => ({ requestId: 'r-1', tenant: 't' }) });
    const data = { to: 'a@b.c', metadata: { mine: true } };

    await helper.add({ name: 'send', data, opts: { attempts: 3 } });

    expect(helper.fakeQueue.added).toHaveLength(1);
    expect(helper.fakeQueue.added[0].data).toBe(data);
    expect(helper.fakeQueue.added[0].opts).toEqual(
      withMetadata({ attempts: 3 }, { requestId: 'r-1', tenant: 't' }),
    );
    // The data's own `metadata` key is the app's: never read, never touched.
    expect(data.metadata).toEqual({ mine: true });
  });

  test('runs on every add (an async stamp too)', async () => {
    let counter = 0;
    const helper = build({
      metadata: async () => {
        counter += 1;

        return { n: counter };
      },
    });

    await helper.add({ name: 'a', data: 1 });
    await helper.add({ name: 'a', data: 2 });

    expect(helper.fakeQueue.added.map((entry) => entry.opts)).toEqual([
      withMetadata({}, { n: 1 }),
      withMetadata({}, { n: 2 }),
    ]);
  });

  test('data of any shape is forwarded as it is', async () => {
    const helper = build({ metadata: () => ({ a: 1 }) });

    for (const data of ['text', ['a', 'b'], 42, null]) {
      await helper.add({ name: 'x', data });
    }

    expect(helper.fakeQueue.added.map((entry) => entry.data)).toEqual([
      'text',
      ['a', 'b'],
      42,
      null,
    ]);
  });

  test('without the option, add forwards the options as given and stamps nothing', async () => {
    const helper = build();
    const opts: JobsOptions = { delay: 5 };

    await helper.add({ name: 'x', data: 1, opts });

    expect(helper.fakeQueue.added[0].opts).toBe(opts);
    expect(helper.fakeQueue.added[0].opts).not.toHaveProperty('metadata');
  });

  test('a throwing stamp fails the add: nothing is enqueued unstamped', async () => {
    const helper = build({
      metadata: () => {
        throw getError({ message: 'no request context' });
      },
    });
    const error = await RejectionUtility.rejectionOf({ task: helper.add({ name: 'x', data: 1 }) });

    expect((error as Error).message).toContain('no request context');
    expect(helper.fakeQueue.added).toHaveLength(0);
  });

  test.each([
    ['an array', () => [1]],
    ['null', () => null],
    ['a string', () => 'x'],
  ])('a stamp that is %s is refused', async (_name, stamp) => {
    const untypedOptions: Record<string, unknown> = { metadata: stamp };
    const helper = build({ ...untypedOptions });
    const error = await RejectionUtility.rejectionOf({ task: helper.add({ name: 'x', data: 1 }) });

    expect((error as Error).message).toContain('must answer a plain object');
    expect(helper.fakeQueue.added).toHaveLength(0);
  });

  test('a caller opts.metadata is refused, never overwritten', async () => {
    const helper = build({ metadata: () => ({ a: 1 }) });
    const untyped: Record<string, unknown> = { metadata: { mine: 1 } };
    const error = await RejectionUtility.rejectionOf({
      task: helper.add({ name: 'x', data: 1, opts: untyped }),
    });

    expect((error as Error).message).toContain('opts.metadata is stamped by the helper');
    expect(helper.fakeQueue.added).toHaveLength(0);
  });

  test('add needs a queue helper', async () => {
    const helper = build({ role: 'worker' });
    const error = await RejectionUtility.rejectionOf({ task: helper.add({ name: 'x', data: 1 }) });

    expect((error as Error).message).toContain("role 'queue'");
  });
});

describe('BullMQ keeps the metadata key: the pin the design stands on', () => {
  test('reading: Job.optsFromJSON returns an unknown option key as it was stored', () => {
    const restored = Job.optsFromJSON(
      JSON.stringify({ attempts: 3, metadata: { requestId: 'r-1' } }),
    );

    expect(Reflect.get(restored, 'metadata')).toEqual({ requestId: 'r-1' });
    expect(restored.attempts).toBe(3);
  });

  /**
   * Writing: BullMQ encodes the options of `Queue.add` in a function that is private to its Redis backend (`optsAsJSON`), so no
   * Redis-free call reaches it. The installed source is read instead: its `else` branch must still copy an option key it does not
   * know. When a BullMQ release changes that, this fails and the metadata slot must be re-checked against a live Redis.
   */
  test('writing: the installed encoder copies an option key it does not know', () => {
    const require = createRequire(import.meta.url);
    const file = join(
      dirname(require.resolve('bullmq/package.json')),
      'dist/esm/classes/redis-queue-backend.js',
    );
    const source = readFileSync(file, 'utf8');
    const start = source.indexOf('function optsAsJSON(');
    const encoder = source.slice(start, source.indexOf('\n}\n', start));

    expect(start).toBeGreaterThan(-1);
    expect(encoder).toMatch(/else\s*\{\s*options\[attributeName\]\s*=\s*value;\s*\}/);
  });

  /** Reading: workers and `getJob` decode through the backend's private `optsFromJSON`, not the public `Job` static. */
  test('reading: the installed backend decoder keeps an option key it does not know', () => {
    const require = createRequire(import.meta.url);
    const file = join(
      dirname(require.resolve('bullmq/package.json')),
      'dist/esm/classes/redis-queue-backend.js',
    );
    const source = readFileSync(file, 'utf8');
    const start = source.indexOf('function optsFromJSON(');
    const decoder = source.slice(start, source.indexOf('\n}\n', start));

    expect(start).toBeGreaterThan(-1);
    expect(decoder).toMatch(/else\s*\{\s*options\[attributeName\]\s*=\s*value;\s*\}/);
  });
});

describe('the worker side', () => {
  const run = async (opts: JobsOptions | undefined, data: unknown) => {
    const seen: Array<{ data: unknown; metadata: unknown }> = [];
    const helper = build({
      role: 'worker',
      onWorkerData: async (job, context) => {
        seen.push({ data: job.data, metadata: context.metadata });

        return undefined;
      },
    });
    const job = { id: '1', name: 'x', data, opts };

    if (!isJob(job)) {
      throw getError({ message: 'the fake is not a job' });
    }

    await helper.readProcessor()(job);

    return seen;
  };

  test('onWorkerData is told the metadata, and job.data is exactly what was added', async () => {
    const seen = await run(withMetadata({}, { requestId: 'r-1' }), { strict: true });

    expect(seen).toEqual([{ data: { strict: true }, metadata: { requestId: 'r-1' } }]);
  });

  test('a job added without a stamp has no metadata', async () => {
    const result = await run({ attempts: 1 }, 'raw');
    expect(result).toEqual([{ data: 'raw', metadata: undefined }]);
  });

  test('readMetadata ignores a value that is not an object', () => {
    for (const metadata of ['x', ['a'], 3, null]) {
      expect(
        BullMQHelper.readMetadata({ job: { opts: withMetadata({}, metadata) } }),
      ).toBeUndefined();
    }

    expect(BullMQHelper.readMetadata({ job: undefined })).toBeUndefined();
  });
});

describe('the prefix', () => {
  test('reaches the Queue and the Worker options', () => {
    const queueHelper = build({ prefix: 'bull:local:ada' });
    const workerHelper = build({ prefix: 'bull:local:ada', role: 'worker' });

    expect(queueHelper.exposeQueueOptions().prefix).toBe('bull:local:ada');
    expect(workerHelper.exposeWorkerOptions().prefix).toBe('bull:local:ada');
  });

  test('unset leaves no prefix key: BullMQ keeps its own', () => {
    const helper = build();

    expect(helper.exposeQueueOptions()).not.toHaveProperty('prefix');
    expect(helper.exposeWorkerOptions()).not.toHaveProperty('prefix');
  });

  test('the old way (queueOptions.prefix alone) still works', () => {
    expect(build({ queueOptions: { prefix: 'old' } }).exposeQueueOptions().prefix).toBe('old');
  });

  test('a queueOptions.prefix or workerOptions.prefix that differs is refused, one that equals it is accepted', () => {
    expect(() => build({ prefix: 'a', queueOptions: { prefix: 'b' } })).toThrow(
      'queueOptions.prefix',
    );
    expect(() => build({ prefix: 'a', workerOptions: { prefix: 'b' } })).toThrow(
      'workerOptions.prefix',
    );
    expect(build({ prefix: 'a', queueOptions: { prefix: 'a' } }).exposeQueueOptions().prefix).toBe(
      'a',
    );
  });

  test.each([
    ['empty', ''],
    ['with a space', 'bull local'],
    ['with a tab', 'bull\tlocal'],
    ['with an opening brace', 'bull{x'],
    ['with a closing brace', 'bull}x'],
  ])('a prefix %s is refused', (_name, prefix) => {
    expect(() => build({ prefix })).toThrow('Invalid prefix');
  });

  test('the cluster hash tag stays on the queue name, not in the prefix', () => {
    const helper = new TestHelper({
      queueName: 'mail',
      identifier: 'test',
      role: 'queue',
      redisConnection: redis({ isCluster: true }),
      prefix: 'bull:local',
    });

    expect(helper.exposeQueueName()).toBe('{mail}');
    expect(helper.exposeQueueOptions().prefix).toBe('bull:local');
  });
});
