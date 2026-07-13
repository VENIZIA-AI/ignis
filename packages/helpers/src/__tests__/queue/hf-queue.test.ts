import { describe, expect, test } from 'bun:test';
import { HfQueueHelper } from '@/modules/queue/internal/hf';

describe('HfQueueHelper — generic FIFO queue (O(1) enqueue/dequeue/cancel)', () => {
  test('enqueue/dequeue preserve FIFO order; size tracks live entries; empty → null', () => {
    const q = new HfQueueHelper<number>();
    expect(q.size).toBe(0);
    expect(q.dequeue()).toBeNull();

    q.enqueue({ value: 1 });
    q.enqueue({ value: 2 });
    q.enqueue({ value: 3 });
    expect(q.size).toBe(3);

    expect(q.dequeue()).toBe(1);
    expect(q.dequeue()).toBe(2);
    expect(q.size).toBe(1);
    expect(q.dequeue()).toBe(3);
    expect(q.size).toBe(0);
    expect(q.dequeue()).toBeNull();
  });

  test('cancel removes a still-queued node (skipped by dequeue, dropped from size)', () => {
    const q = new HfQueueHelper<string>();
    const a = q.enqueue({ value: 'a' });
    const b = q.enqueue({ value: 'b' });
    q.enqueue({ value: 'c' });

    q.cancel({ node: b }); // cancel the middle one
    expect(q.size).toBe(2);

    expect(q.dequeue()).toBe('a');
    expect(q.dequeue()).toBe('c'); // b skipped
    expect(q.dequeue()).toBeNull();

    // cancel is idempotent + safe on an already-dequeued node (no double-decrement).
    q.cancel({ node: a });
    q.cancel({ node: b });
    expect(q.size).toBe(0);
  });

  test('drain returns remaining LIVE values in FIFO order and empties the queue', () => {
    const q = new HfQueueHelper<number>();
    q.enqueue({ value: 10 });
    const mid = q.enqueue({ value: 20 });
    q.enqueue({ value: 30 });
    q.cancel({ node: mid });

    expect(q.drain()).toEqual([10, 30]);
    expect(q.size).toBe(0);
    expect(q.dequeue()).toBeNull();
  });

  test('large burst (> compaction threshold) preserves strict FIFO order', () => {
    const q = new HfQueueHelper<number>();
    const count = 1000; // exceeds the 256 compaction threshold, exercising splice-compaction
    for (let i = 0; i < count; i += 1) {
      q.enqueue({ value: i });
    }
    expect(q.size).toBe(count);

    const out: number[] = [];
    for (let i = 0; i < count; i += 1) {
      out.push(q.dequeue() as number);
    }
    expect(out).toEqual(Array.from({ length: count }, (_, i) => i));
    expect(q.size).toBe(0);
    expect(q.dequeue()).toBeNull();
  });

  test('BUG: cancelling a node that drain() already handed out must not corrupt size', () => {
    const q = new HfQueueHelper<string>();
    const a = q.enqueue({ value: 'a' });
    const b = q.enqueue({ value: 'b' });

    expect(q.drain()).toEqual(['a', 'b']);
    expect(q.size).toBe(0);

    // A drained owner (e.g. a pool waiter whose acquire timer fires after destroy()) still holds its
    // node handle. dequeue() marks consumed nodes so a late cancel() is a no-op; drain() must too.
    q.cancel({ node: a });
    q.cancel({ node: b });
    expect(q.size).toBe(0);

    q.enqueue({ value: 'c' });
    expect(q.size).toBe(1);
    expect(q.dequeue()).toBe('c');
    expect(q.size).toBe(0);
    expect(q.dequeue()).toBeNull();
  });

  test('backing array stays bounded under sustained one-in/one-out traffic (no head-index leak)', () => {
    const q = new HfQueueHelper<number>();
    const nodes = q['nodes'] as Array<unknown>;

    for (let index = 0; index < 5_000; index += 1) {
      q.enqueue({ value: index });
      expect(q.dequeue()).toBe(index);
    }

    expect(q.size).toBe(0);
    expect(nodes.length).toBeLessThanOrEqual(HfQueueHelper['COMPACT_THRESHOLD'] + 1);
  });

  test('interleaved enqueue/dequeue with cancellations stays consistent', () => {
    const q = new HfQueueHelper<number>();
    q.enqueue({ value: 1 });
    const n2 = q.enqueue({ value: 2 });
    expect(q.dequeue()).toBe(1);
    q.enqueue({ value: 3 });
    q.cancel({ node: n2 }); // cancel 2 after 1 was served
    q.enqueue({ value: 4 });
    expect(q.size).toBe(2); // 3 and 4 live
    expect(q.dequeue()).toBe(3);
    expect(q.dequeue()).toBe(4);
    expect(q.dequeue()).toBeNull();
  });
});
