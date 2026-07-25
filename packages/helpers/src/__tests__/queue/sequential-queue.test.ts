import { AnyType } from '@/common/types';
import { getError } from '@/modules/error';
import {
  QueueStatuses,
  SequentialQueueHelper,
  TQueueStatus,
} from '@/modules/queue/internal/sequential';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

interface IDeferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

const createDeferred = <T>(): IDeferred<T> => {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>(innerResolve => {
    resolve = innerResolve;
  });

  return { promise, resolve };
};

/** The queue drives itself via a generator whose promise nobody awaits, so tests wait on a queue callback instead of awaiting processing; the timeout exists only so a stall regression fails fast instead of hanging. */
const SETTLE_TIMEOUT = 300;
const withTimeout = <T>(opts: { promise: Promise<T> }): Promise<T | 'TIMED_OUT'> => {
  const { promise } = opts;

  return Promise.race([
    promise,
    new Promise<'TIMED_OUT'>(resolve => {
      const timer = setTimeout(() => {
        resolve('TIMED_OUT');
      }, SETTLE_TIMEOUT);
      timer.unref?.();
    }),
  ]);
};

const flush = async (): Promise<void> => {
  await new Promise<void>(resolve => {
    setImmediate(resolve);
  });
  await new Promise<void>(resolve => {
    setImmediate(resolve);
  });
};

describe('SequentialQueueHelper — state machine', () => {
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

  test('WAITING -> PROCESSING -> WAITING per element; FIFO order; totalEvent counts every enqueue', async () => {
    const processed: number[] = [];
    const transitions: Array<{ from: TQueueStatus; to: TQueueStatus }> = [];
    const drained = createDeferred<void>();

    const queue = new SequentialQueueHelper<number>({
      identifier: 'tc-happy-path',
      onMessage: ({ queueElement }) => {
        processed.push(queueElement.payload);
      },
      onStateChange: ({ from, to }) => {
        transitions.push({ from, to });
      },
      onDataDequeue: () => {
        if (processed.length === 3) {
          drained.resolve();
        }
      },
    });

    await queue.enqueue(1);
    await queue.enqueue(2);
    await queue.enqueue(3);

    expect(await withTimeout({ promise: drained.promise })).not.toBe('TIMED_OUT');

    expect(processed).toEqual([1, 2, 3]);
    expect(queue.getTotalEvent()).toBe(3);
    expect(queue.storage.length).toBe(0);
    expect(queue.getState()).toBe(QueueStatuses.WAITING);
    expect(queue.getProcessingEvents().size).toBe(0);
    expect(transitions[0]).toEqual({
      from: QueueStatuses.WAITING,
      to: QueueStatuses.PROCESSING,
    });
    expect(transitions.at(-1)).toEqual({
      from: QueueStatuses.PROCESSING,
      to: QueueStatuses.WAITING,
    });
  });

  test('autoDispatch=false holds elements until nextMessage() is requested', async () => {
    const processed: number[] = [];
    const drained = createDeferred<void>();

    const queue = new SequentialQueueHelper<number>({
      identifier: 'tc-manual-dispatch',
      autoDispatch: false,
      onMessage: ({ queueElement }) => {
        processed.push(queueElement.payload);
      },
      onDataDequeue: () => {
        if (processed.length === 2) {
          drained.resolve();
        }
      },
    });

    await queue.enqueue(10);
    await queue.enqueue(20);
    await flush();

    expect(processed).toEqual([]);
    expect(queue.storage.length).toBe(2);

    queue.nextMessage();

    expect(await withTimeout({ promise: drained.promise })).not.toBe('TIMED_OUT');
    expect(processed).toEqual([10, 20]);
  });

  test('lock() suspends dispatch; unlock() resumes and drains the backlog', async () => {
    const processed: number[] = [];
    const drained = createDeferred<void>();

    const queue = new SequentialQueueHelper<number>({
      identifier: 'tc-lock',
      onMessage: ({ queueElement }) => {
        processed.push(queueElement.payload);
      },
      onDataDequeue: () => {
        if (processed.length === 2) {
          drained.resolve();
        }
      },
    });

    queue.lock();
    expect(queue.getState()).toBe(QueueStatuses.LOCKED);

    await queue.enqueue(1);
    await queue.enqueue(2);
    await flush();
    expect(processed).toEqual([]);
    expect(queue.storage.length).toBe(2);

    queue.unlock({ shouldProcessNextElement: true });

    expect(await withTimeout({ promise: drained.promise })).not.toBe('TIMED_OUT');
    expect(processed).toEqual([1, 2]);
    expect(queue.getState()).toBe(QueueStatuses.WAITING);
  });

  test('BUG: an async-throwing onMessage must not stall the queue nor raise an unhandled rejection', async () => {
    const processed: number[] = [];
    const drained = createDeferred<void>();

    const queue = new SequentialQueueHelper<number>({
      identifier: 'tc-throwing-async-handler',
      onMessage: async ({ queueElement }) => {
        processed.push(queueElement.payload);

        if (queueElement.payload === 1) {
          throw getError({ message: 'boom-async' }); // simulates a foreign handler failure
        }
      },
      onDataDequeue: () => {
        if (processed.length === 2) {
          drained.resolve();
        }
      },
    });

    await queue.enqueue(1);
    await queue.enqueue(2);

    expect(await withTimeout({ promise: drained.promise })).not.toBe('TIMED_OUT');
    await flush();

    expect(processed).toEqual([1, 2]); // the failing element must NOT block the next one
    expect(queue.storage.length).toBe(0); // no unbounded growth behind a stuck element
    expect(queue.getState()).toBe(QueueStatuses.WAITING);
    expect(queue.getProcessingEvents().size).toBe(0);
    expect(unhandledRejections).toEqual([]);
  });

  test('BUG: a SYNC-throwing onMessage must not stall the queue nor raise an unhandled rejection', async () => {
    const processed: number[] = [];
    const drained = createDeferred<void>();

    const queue = new SequentialQueueHelper<number>({
      identifier: 'tc-throwing-sync-handler',
      onMessage: ({ queueElement }) => {
        processed.push(queueElement.payload);

        if (queueElement.payload === 1) {
          throw getError({ message: 'boom-sync' }); // simulates a foreign handler failure
        }
      },
      onDataDequeue: () => {
        if (processed.length === 2) {
          drained.resolve();
        }
      },
    });

    await queue.enqueue(1);
    await queue.enqueue(2);

    expect(await withTimeout({ promise: drained.promise })).not.toBe('TIMED_OUT');
    await flush();

    expect(processed).toEqual([1, 2]);
    expect(queue.storage.length).toBe(0);
    expect(queue.getState()).toBe(QueueStatuses.WAITING);
    expect(unhandledRejections).toEqual([]);
  });

  test('BUG: a SYNC-throwing onDataDequeue/onDataEnqueue must not break the queue', async () => {
    const processed: number[] = [];
    const drained = createDeferred<void>();
    let dequeueCount = 0;

    const queue = new SequentialQueueHelper<number>({
      identifier: 'tc-throwing-data-hooks',
      onMessage: ({ queueElement }) => {
        processed.push(queueElement.payload);
      },
      onDataEnqueue: () => {
        throw getError({ message: 'enqueue-hook-boom' });
      },
      onDataDequeue: () => {
        dequeueCount += 1;
        if (dequeueCount === 2) {
          drained.resolve();
        }

        throw getError({ message: 'dequeue-hook-boom' });
      },
    });

    await queue.enqueue(1);
    await queue.enqueue(2);

    expect(await withTimeout({ promise: drained.promise })).not.toBe('TIMED_OUT');
    await flush();

    expect(processed).toEqual([1, 2]);
    expect(queue.storage.length).toBe(0);
    expect(queue.getState()).toBe(QueueStatuses.WAITING);
    expect(unhandledRejections).toEqual([]);
  });

  test('BUG: a SYNC-throwing onStateChange must not escape lock()/unlock()/settle()/close()', async () => {
    const queue = new SequentialQueueHelper<number>({
      identifier: 'tc-throwing-state-hook',
      onMessage: () => {},
      onStateChange: () => {
        throw getError({ message: 'state-hook-boom' });
      },
    });

    expect(() => queue.lock()).not.toThrow();
    expect(() => queue.unlock({ shouldProcessNextElement: false })).not.toThrow();
    expect(() => queue.settle()).not.toThrow();
    expect(() => queue.close()).not.toThrow();

    await flush();
    expect(unhandledRejections).toEqual([]);
  });

  test('settle() closes the queue for new elements and reports isSettled once drained', async () => {
    const processed: number[] = [];
    const drained = createDeferred<void>();

    const queue = new SequentialQueueHelper<number>({
      identifier: 'tc-settle',
      onMessage: ({ queueElement }) => {
        processed.push(queueElement.payload);
      },
      onDataDequeue: () => {
        drained.resolve();
      },
    });

    await queue.enqueue(1);
    expect(await withTimeout({ promise: drained.promise })).not.toBe('TIMED_OUT');

    queue.settle();
    expect(queue.getState()).toBe(QueueStatuses.SETTLED);
    expect(queue.isSettled()).toBe(true);

    await queue.enqueue(2);
    await flush();

    expect(processed).toEqual([1]);
    expect(queue.storage.length).toBe(0); // settled queue accepts nothing more
    expect(queue.getTotalEvent()).toBe(1);
  });

  test('close() settles the queue and stops the generator; further dispatch is a no-op', async () => {
    const processed: number[] = [];

    const queue = new SequentialQueueHelper<number>({
      identifier: 'tc-close',
      onMessage: ({ queueElement }) => {
        processed.push(queueElement.payload);
      },
    });

    queue.close();
    expect(queue.getState()).toBe(QueueStatuses.SETTLED);

    await queue.enqueue(1);
    queue.nextMessage();
    await flush();

    expect(processed).toEqual([]);
    expect(unhandledRejections).toEqual([]);
  });

  test('a queue without onMessage never initializes an iterator and keeps its elements', async () => {
    const queue = new SequentialQueueHelper<number>({ identifier: 'tc-no-handler' });

    await queue.enqueue(1);
    await flush();

    expect(queue.storage.length).toBe(1);
    expect(queue.getState()).toBe(QueueStatuses.WAITING);
    expect(unhandledRejections).toEqual([]);
  });

  test('falsy payloads are rejected before reaching storage', async () => {
    const queue = new SequentialQueueHelper<AnyType>({
      identifier: 'tc-falsy',
      autoDispatch: false,
      onMessage: () => {},
    });

    await queue.enqueue(0);
    await queue.enqueue('');
    await queue.enqueue(null);

    expect(queue.storage.length).toBe(0);
    expect(queue.getTotalEvent()).toBe(0);
  });
});
