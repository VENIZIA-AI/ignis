import { TNullable } from '@/common/types';
import { BaseHelper } from '@/modules/base';
import { IHfQueueNode } from './types';

/** High-frequency, single-consumer FIFO queue with O(1) enqueue/dequeue/cancel: an array plus a moving head index (no `Array.shift()`, which is O(n)), cancellation flags the node instead of splicing, and the consumed prefix is compacted only occasionally. Not thread-safe. */
export class HfQueueHelper<T> extends BaseHelper {
  private readonly nodes: IHfQueueNode<T>[] = [];

  private head = 0; // index of the next node to consider
  private liveCount = 0; // enqueued − (dequeued + cancelled)

  // Reclaim the consumed prefix once it dominates the backing array.
  private static readonly COMPACT_THRESHOLD = 256;

  constructor(opts?: { scope?: string }) {
    super({ scope: opts?.scope ?? HfQueueHelper.name });
  }

  /** Number of live entries (enqueued, not yet dequeued or cancelled). */
  get size(): number {
    return this.liveCount;
  }

  /** Append a value and return a node handle usable to cancel it later. O(1). */
  enqueue(opts: { value: T }): IHfQueueNode<T> {
    const node: IHfQueueNode<T> = { value: opts.value, isCancelled: false };
    this.nodes.push(node);

    this.liveCount += 1;
    return node;
  }

  /** Remove + return the next live value in FIFO order, skipping cancelled nodes. Null when empty. */
  dequeue(): TNullable<T> {
    while (this.head < this.nodes.length && this.nodes[this.head].isCancelled) {
      this.head += 1;
    }

    if (this.head >= this.nodes.length) {
      // fully drained → cheap reset
      this.reset();
      return null;
    }

    const node = this.nodes[this.head];

    this.head += 1;
    this.liveCount -= 1;
    node.isCancelled = true; // mark consumed so a late cancel() of this node is a no-op

    if (this.head > HfQueueHelper.COMPACT_THRESHOLD && this.head * 2 >= this.nodes.length) {
      this.nodes.splice(0, this.head);
      this.head = 0;
    }
    return node.value;
  }

  /** Mark a still-queued node cancelled so {@link dequeue} and {@link size} skip it. Idempotent. O(1). */
  cancel(opts: { node: IHfQueueNode<T> }): void {
    if (opts.node.isCancelled) {
      return;
    }

    opts.node.isCancelled = true;
    this.liveCount -= 1;
  }

  /** Remove and return every remaining LIVE value in FIFO order (e.g. on shutdown), emptying the queue. */
  drain(): T[] {
    const values: T[] = [];
    for (let index = this.head; index < this.nodes.length; index += 1) {
      const node = this.nodes[index];
      if (!node.isCancelled) {
        values.push(node.value);
        node.isCancelled = true; // mark consumed so a late cancel() of this node is a no-op, as in dequeue()
      }
    }

    this.reset();
    return values;
  }

  private reset(): void {
    this.nodes.length = 0;
    this.head = 0;
    this.liveCount = 0;
  }
}
