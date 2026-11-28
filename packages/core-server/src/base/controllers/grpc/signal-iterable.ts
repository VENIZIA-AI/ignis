import { ExecutionFrames } from '@venizia/ignis-helpers/core';

/** What a followed stream reads and when it stops. */
export interface IGrpcSignalIterable<Message> {
  source: AsyncIterable<Message>;
  signal: AbortSignal;
  /** What a read rejects with once the signal has aborted. */
  toError: () => unknown;
  /** Told the source when a read is given up on: the source of an answer is returned, so its `finally` runs. */
  abandon?: (opts: { iterator: AsyncIterator<Message> }) => void;
}

/**
 * An async iterable that stops with its signal: a read in flight, and every later one, rejects when it aborts, however
 * long the source stays quiet. One `abort` listener serves all the reads of an iterator.
 *
 * @internal
 */
export class GrpcSignalIterable<Message> implements AsyncIterableIterator<Message> {
  private readonly iterator: AsyncIterator<Message>;
  /** The reject of each read in flight. */
  private readonly reads = new Set<(reason: unknown) => void>();
  /** Aborted when the iterator ends, which takes the listener off the signal. */
  private readonly ended = new AbortController();
  readonly throw?: (error?: unknown) => Promise<IteratorResult<Message>>;

  private constructor(private readonly options: IGrpcSignalIterable<Message>) {
    const iterator = options.source[Symbol.asyncIterator]();
    this.iterator = iterator;

    // `yield*` calls `throw` only on an iterator that has one.
    this.throw = iterator.throw?.bind(iterator);

    options.signal.addEventListener(
      'abort',
      ExecutionFrames.listener({
        handler: () => {
          for (const reject of this.reads) {
            reject(options.toError());
          }
        },
      }),
      { signal: this.ended.signal },
    );
  }

  static follow<Message>(opts: IGrpcSignalIterable<Message>): AsyncIterable<Message> {
    return { [Symbol.asyncIterator]: () => new GrpcSignalIterable(opts) };
  }

  [Symbol.asyncIterator]() {
    return this;
  }

  async next(): Promise<IteratorResult<Message>> {
    const { signal, toError, abandon } = this.options;
    // A promise of this read alone: one shared by every read would keep each result until the call ends.
    const aborted = Promise.withResolvers<never>();
    this.reads.add(aborted.reject);
    let isOpen = false;

    try {
      if (signal.aborted) {
        throw toError();
      }

      const result = await Promise.race([this.iterator.next(), aborted.promise]);
      isOpen = result.done !== true;

      return result;
    } catch (error) {
      if (signal.aborted) {
        abandon?.({ iterator: this.iterator });
      }

      throw error;
    } finally {
      this.reads.delete(aborted.reject);

      if (!isOpen) {
        this.ended.abort();
      }
    }
  }

  async return(value?: unknown): Promise<IteratorResult<Message>> {
    this.ended.abort();

    // A source still busy with a read answers `return` only after it: an aborted call does not wait for that.
    if (this.options.signal.aborted) {
      this.options.abandon?.({ iterator: this.iterator });

      return { done: true, value };
    }

    const result = await this.iterator.return?.(value);

    return result ?? { done: true, value };
  }
}
