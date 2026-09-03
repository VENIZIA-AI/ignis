import { describe, expect, test } from 'bun:test';
import { BullMQExecutorModes, MailExecutorErrors } from '@/components/mail/common';
import type { IMailProcessorResult, IQueueJobPayload } from '@/components/mail/common';
import {
  BullMQMailExecutorHelper,
  DirectMailExecutorHelper,
  InternalQueueMailExecutorHelper,
} from '@/components/mail/helpers';
import { type AnyType } from '@venizia/ignis-helpers/common';
import { LoggerFactory } from '@venizia/ignis-helpers';
import { ProcessorCallTracker, successProcessorResult } from './fakes';

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

describe('DirectMailExecutorHelper', () => {
  test('enqueue without setProcessor throws PROCESSOR_NOT_SET', async () => {
    const executor = new DirectMailExecutorHelper();

    const error = await executor
      .enqueueVerificationEmail('a@b.com')
      .catch((caught: AnyType) => caught);

    expect(error.message).toBe(MailExecutorErrors.PROCESSOR_NOT_SET);
  });

  test('runs the processor inline and reports queued: false', async () => {
    const executor = new DirectMailExecutorHelper();
    const tracker = new ProcessorCallTracker();

    executor.setProcessor(async (email: string) => {
      tracker.record(email);
      return successProcessorResult;
    });

    const result = await executor.enqueueVerificationEmail('a@b.com');

    expect(tracker.calls).toEqual(['a@b.com']);
    expect(result.queued).toBe(false);
    expect(result.result).toEqual(successProcessorResult);
  });

  test('a SYNCHRONOUSLY throwing processor rejects the caller and leaves the executor usable', async () => {
    const executor = new DirectMailExecutorHelper();
    let shouldThrow = true;

    executor.setProcessor(((email: string) => {
      if (shouldThrow) {
        throw new Error('sync boom');
      }

      return Promise.resolve({ ...successProcessorResult, message: email });
    }) as AnyType);

    const syncError = await executor
      .enqueueVerificationEmail('a@b.com')
      .catch((caught: AnyType) => caught);
    expect(syncError.message).toBe('sync boom');

    shouldThrow = false;
    const result = await executor.enqueueVerificationEmail('c@d.com');
    expect(result.result?.message).toBe('c@d.com');
  });
});

describe('InternalQueueMailExecutorHelper', () => {
  test('enqueue without setProcessor throws PROCESSOR_NOT_SET', async () => {
    const executor = new InternalQueueMailExecutorHelper({ identifier: 'mail-no-processor' });

    const error = await executor
      .enqueueVerificationEmail('a@b.com')
      .catch((caught: AnyType) => caught);

    expect(error.message).toBe(MailExecutorErrors.PROCESSOR_NOT_SET);
    await executor.close();
  });

  test('dispatches the job to the processor', async () => {
    const executor = new InternalQueueMailExecutorHelper({ identifier: 'mail-dispatch' });
    const tracker = new ProcessorCallTracker();

    executor.setProcessor(async (email: string) => {
      tracker.record(email);
      return successProcessorResult;
    });

    const result = await executor.enqueueVerificationEmail('a@b.com');
    expect(result.queued).toBe(true);

    await tracker.waitFor({ expected: 1 });
    expect(tracker.calls).toEqual(['a@b.com']);
    await executor.close();
  });

  test('a poison job retries up to `attempts` and then STOPS - it never loops forever', async () => {
    const executor = new InternalQueueMailExecutorHelper({ identifier: 'mail-poison' });
    const tracker = new ProcessorCallTracker();

    executor.setProcessor(async (email: string) => {
      tracker.record(email);
      throw new Error('always fails');
    });

    await executor.enqueueVerificationEmail('a@b.com', {
      attempts: 3,
      backoff: { type: 'fixed', delay: 1 },
    });

    await tracker.waitFor({ expected: 3 });
    await sleep(30);

    expect(tracker.calls).toHaveLength(3);
    await executor.close();
  });

  test('a processor that RESOLVES with success:false is a failure, not a completed job', async () => {
    // The trap: a processor reports an SMTP rejection by RETURNING `{ success: false }` rather than throwing, and a queue that only watches for throws marks the job completed, deletes it, and the mail is gone with no retry and no trace.
    const executor = new InternalQueueMailExecutorHelper({ identifier: 'mail-soft-failure' });
    const tracker = new ProcessorCallTracker();

    executor.setProcessor(async (email: string) => {
      tracker.record(email);
      return { success: false, message: 'SMTP 535', expiresInMinutes: 0 };
    });

    await executor.enqueueVerificationEmail('a@b.com', {
      attempts: 3,
      backoff: { type: 'fixed', delay: 1 },
    });

    await tracker.waitFor({ expected: 3 });
    await sleep(30);

    // Retried like any other failure, and it stops at `attempts`.
    expect(tracker.calls).toHaveLength(3);
    await executor.close();
  });

  test('a SYNCHRONOUSLY throwing processor is caught per job - the queue survives it', async () => {
    const executor = new InternalQueueMailExecutorHelper({ identifier: 'mail-sync-throw' });
    const tracker = new ProcessorCallTracker();

    executor.setProcessor(((email: string) => {
      tracker.record(email);
      throw new Error('sync boom');
    }) as AnyType);

    await executor.enqueueVerificationEmail('a@b.com', {
      attempts: 1,
      backoff: { type: 'fixed', delay: 1 },
    });

    await tracker.waitFor({ expected: 1 });

    // Queue still accepts and dispatches work after the synchronous throw.
    const survivor = new ProcessorCallTracker();
    executor.setProcessor(async (email: string) => {
      survivor.record(email);
      return successProcessorResult;
    });

    await executor.enqueueVerificationEmail('c@d.com');
    await survivor.waitFor({ expected: 1 });

    expect(survivor.calls).toEqual(['c@d.com']);
    await executor.close();
  });

  test('close() clears pending delayed timers instead of leaking them', async () => {
    const executor = new InternalQueueMailExecutorHelper({ identifier: 'mail-delay-leak' });
    const tracker = new ProcessorCallTracker();

    executor.setProcessor(async (email: string) => {
      tracker.record(email);
      return successProcessorResult;
    });

    await executor.enqueueVerificationEmail('a@b.com', { delay: 60_000 });
    expect(executor['delayedJobs'].size).toBe(1);

    await executor.close();

    expect(executor['delayedJobs'].size).toBe(0);
    await sleep(10);
    expect(tracker.calls).toHaveLength(0);
  });
});

/** Worker/queue doubles: no Redis, no BullMQ. Only the executor's own bookkeeping is under test. */
class FakeWorkerHelper {
  isClosed = false;
  worker: { close: () => Promise<void> };

  constructor(private opts: { failOnClose?: boolean } = {}) {
    this.worker = {
      close: async () => {
        if (this.opts.failOnClose) {
          throw new Error('worker close failed');
        }

        this.isClosed = true;
      },
    };
  }
}

class FakeQueueHelper {
  isClosed = false;
  addedJobs: Array<{ name: string; payload: IQueueJobPayload; options: AnyType }> = [];

  queue = {
    add: async (name: string, payload: IQueueJobPayload, options: AnyType) => {
      this.addedJobs.push({ name, payload, options });
      return { id: 'bull-1' };
    },
    close: async () => {
      this.isClosed = true;
    },
  };
}

class FakeRedisConnection {
  isDisconnected = false;

  async disconnect(): Promise<boolean> {
    this.isDisconnected = true;
    return true;
  }
}

/** The real constructor opens a Redis connection, so the executor is built off its prototype with collaborators injected - the teardown/mode/enqueue logic under test is entirely its own. */
const buildBullMQExecutor = (opts: {
  mode: string;
  workerHelpers?: FakeWorkerHelper[];
  queueHelper?: FakeQueueHelper;
  redisConnection?: FakeRedisConnection;
  processor?: (email: string) => Promise<IMailProcessorResult>;
}) => {
  const executor: BullMQMailExecutorHelper = Object.create(BullMQMailExecutorHelper.prototype);

  const queueHelper = opts.queueHelper ?? new FakeQueueHelper();
  const redisConnection = opts.redisConnection ?? new FakeRedisConnection();
  const workerHelpers = opts.workerHelpers ?? [];

  Object.assign(executor, {
    logger: LoggerFactory.getLogger([BullMQMailExecutorHelper.name]),
    scope: BullMQMailExecutorHelper.name,
    identifier: 'bullmq-test',
    mode: opts.mode,
    queueIdentifier: 'bullmq-test',
    queueName: 'mail',
    jobIdCounter: 0,
    workerHelpers,
    queueHelper: opts.mode === BullMQExecutorModes.WORKER_ONLY ? undefined : queueHelper,
    redisConnection,
    processor: opts.processor,
  });

  return { executor, queueHelper, redisConnection, workerHelpers };
};

describe('BullMQMailExecutorHelper - teardown', () => {
  test('clearWorkers closes EVERY worker and empties the list even when one close fails', async () => {
    const failing = new FakeWorkerHelper({ failOnClose: true });
    const healthy = new FakeWorkerHelper();

    const { executor } = buildBullMQExecutor({
      mode: BullMQExecutorModes.BOTH,
      workerHelpers: [failing, healthy],
    });

    await executor.clearWorkers();

    expect(healthy.isClosed).toBe(true);
    expect(executor.getWorkerCount()).toBe(0);
  });

  test('removeWorker drops the worker from the list even when its close rejects', async () => {
    const failing = new FakeWorkerHelper({ failOnClose: true });

    const { executor } = buildBullMQExecutor({
      mode: BullMQExecutorModes.BOTH,
      workerHelpers: [failing],
    });

    const error = await executor.removeWorker(0).catch((caught: AnyType) => caught);
    expect(error.message).toBe('worker close failed');
    expect(executor.getWorkerCount()).toBe(0);
  });

  test('removeWorker rejects an out-of-range index without touching the list', async () => {
    const { executor } = buildBullMQExecutor({
      mode: BullMQExecutorModes.BOTH,
      workerHelpers: [new FakeWorkerHelper()],
    });

    expect(await executor.removeWorker(5)).toBe(false);
    expect(await executor.removeWorker(-1)).toBe(false);
    expect(executor.getWorkerCount()).toBe(1);
  });

  test('close() tears down workers AND queue AND redis even when a worker close fails', async () => {
    const failing = new FakeWorkerHelper({ failOnClose: true });
    const healthy = new FakeWorkerHelper();

    const { executor, queueHelper, redisConnection } = buildBullMQExecutor({
      mode: BullMQExecutorModes.BOTH,
      workerHelpers: [failing, healthy],
    });

    const error = await executor.close().catch((caught: AnyType) => caught);
    expect(error.message).toContain('worker close failed');

    expect(healthy.isClosed).toBe(true);
    expect(queueHelper.isClosed).toBe(true);
    expect(redisConnection.isDisconnected).toBe(true);
    expect(executor.getWorkerCount()).toBe(0);
  });

  test('close() on a healthy executor resolves and closes queue + redis', async () => {
    const { executor, queueHelper, redisConnection } = buildBullMQExecutor({
      mode: BullMQExecutorModes.BOTH,
      workerHelpers: [new FakeWorkerHelper()],
    });

    await executor.close();

    expect(queueHelper.isClosed).toBe(true);
    expect(redisConnection.isDisconnected).toBe(true);
  });
});

describe('BullMQMailExecutorHelper - enqueue', () => {
  test('worker-only mode refuses to enqueue', async () => {
    const { executor } = buildBullMQExecutor({ mode: BullMQExecutorModes.WORKER_ONLY });

    const error = await executor
      .enqueueVerificationEmail('a@b.com')
      .catch((caught: AnyType) => caught);
    expect(error.message).toContain('Cannot enqueue jobs in worker-only mode');
  });

  test('both-mode without a processor throws PROCESSOR_NOT_SET', async () => {
    const { executor } = buildBullMQExecutor({ mode: BullMQExecutorModes.BOTH });

    const error = await executor
      .enqueueVerificationEmail('a@b.com')
      .catch((caught: AnyType) => caught);

    expect(error.message).toBe(MailExecutorErrors.PROCESSOR_NOT_SET);
  });

  test('queue-only mode enqueues without a processor and bounds the attempts', async () => {
    const { executor, queueHelper } = buildBullMQExecutor({
      mode: BullMQExecutorModes.QUEUE_ONLY,
    });

    const result = await executor.enqueueVerificationEmail('a@b.com', { attempts: 2 });

    expect(result.queued).toBe(true);
    expect(result.jobId).toBe('bull-1');
    expect(queueHelper.addedJobs).toHaveLength(1);
    expect(queueHelper.addedJobs[0].payload.email).toBe('a@b.com');
    expect(queueHelper.addedJobs[0].options.attempts).toBe(2);
  });

  test('a job without explicit attempts still gets a bounded default', async () => {
    const { executor, queueHelper } = buildBullMQExecutor({
      mode: BullMQExecutorModes.QUEUE_ONLY,
    });

    await executor.enqueueVerificationEmail('a@b.com');
    expect(queueHelper.addedJobs[0].options.attempts).toBe(3);
  });
});
