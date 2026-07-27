/** A handle returned by {@link HfQueueHelper.enqueue}; pass it back to {@link HfQueueHelper.cancel} to remove that entry in O(1) without scanning the queue. */
export interface IHfQueueNode<T> {
  readonly value: T;
  isCancelled: boolean;
}
