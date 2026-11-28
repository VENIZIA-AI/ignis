import { SequentialQueueHelper } from '@/modules/queue';
import { Execution } from '@/modules/execution';
import { describe, expect, test } from 'bun:test';
import { AsyncLocalStorage } from 'node:async_hooks';

const request = new AsyncLocalStorage<string>();

/** A queue that records, for each element, the context its handlers see before and after an await. */
const buildQueue = (opts?: { autoDispatch: boolean }) => {
  const seen: string[] = [];

  const record = (step: string, payload: string) => {
    seen.push(`${step} ${payload}=${request.getStore() ?? 'none'}`);
  };

  const queue = new SequentialQueueHelper<string>({
    identifier: 'context',
    autoDispatch: opts?.autoDispatch,
    onMessage: async ({ queueElement }) => {
      record('start', queueElement.payload);
      await Execution.sleep({ ms: 5 });
      record('end', queueElement.payload);
    },
    onDataDequeue: ({ queueElement }) => record('dequeued', queueElement.payload),
  });

  return { queue, seen };
};

const expected = (payload: string, context: string) => [
  `start ${payload}=${context}`,
  `end ${payload}=${context}`,
  `dequeued ${payload}=${context}`,
];

describe('SequentialQueueHelper - each element runs in the context it was enqueued in', () => {
  test('two requests that enqueue in turn each see only their own', async () => {
    const { queue, seen } = buildQueue();

    await Promise.all([
      request.run('A', () => queue.enqueue('a1')),
      request.run('B', () => queue.enqueue('b1')),
      request.run('A', () => queue.enqueue('a2')),
      request.run('B', () => queue.enqueue('b2')),
    ]);
    await Execution.sleep({ ms: 60 });

    expect(seen).toEqual([
      ...expected('a1', 'A'),
      ...expected('b1', 'B'),
      ...expected('a2', 'A'),
      ...expected('b2', 'B'),
    ]);
  });

  test('an element enqueued outside any request sees none', async () => {
    const { queue, seen } = buildQueue();

    await request.run('A', () => queue.enqueue('a1'));
    await queue.enqueue('plain');
    await Execution.sleep({ ms: 40 });

    expect(seen).toEqual([...expected('a1', 'A'), ...expected('plain', 'none')]);
  });

  test('a queue dispatched later keeps each context', async () => {
    const { queue, seen } = buildQueue({ autoDispatch: false });

    await request.run('A', () => queue.enqueue('a1'));
    await request.run('B', () => queue.enqueue('b1'));
    request.run('C', () => queue.nextMessage());
    await Execution.sleep({ ms: 40 });

    expect(seen.slice(0, 3)).toEqual(expected('a1', 'A'));
  });

  test('an element pushed straight into storage takes the context the queue was built in', async () => {
    const { queue, seen } = request.run('boot', () => buildQueue({ autoDispatch: false }));

    queue.storage.push({ isLocked: false, payload: 'direct' });
    request.run('C', () => queue.nextMessage());
    await Execution.sleep({ ms: 40 });

    expect(seen).toEqual(expected('direct', 'boot'));
  });
});
