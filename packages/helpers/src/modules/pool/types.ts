import { TNullable, ValueOrPromise } from '@/common/types';

export interface IPoolStats {
  size: number;
  available: number;
  borrowed: number;
  pending: number;
}

/** Public contract of an object pool (implemented by AbstractPoolHelper). */
export interface IPool<T> {
  /** Borrow a resource (creating/waiting as needed). Single-borrower until released/discarded. */
  acquire(): Promise<T>;

  /** Return a borrowed resource to the pool (or destroy it if the pool is being torn down). */
  release(opts: { resource: T }): void;

  /** acquire → run execution → release on success; on ANY error DISCARD (destroy) the resource + rethrow. */
  use<R>(opts: { execution: (resource: T) => ValueOrPromise<R> }): Promise<R>;

  /** Remove a borrowed resource from the pool and destroy it. */
  discard(opts: { resource: T }): Promise<void>;

  /** Pre-create resources up to `size` and place them idle. */
  warmup(): Promise<void>;

  /** Drain the pool: reject waiters, destroy idle resources, block new acquires. */
  destroy(): Promise<void>;
  getStats(): IPoolStats;
}

/** Sizing/timeout knobs shared by every pool (no resource-lifecycle callbacks). */
export interface IPoolControlOptions {
  /** Max number of resources the pool will hold/create. */
  size: number;
  /** Max ms to wait for a free resource; omitted → wait forever. */
  acquireTimeoutMs?: number;
  /** Max queued acquirers; omitted → unlimited. Exceeded → acquire() rejects (load-shed). */
  maxWaitingClients?: number;
  /** Logger scope; default 'BasePoolHelper'. */
  scope?: string;
}

/**
 * Options for the callback-configured {@link BasePoolHelper}: control knobs plus the resource
 * lifecycle as callbacks. (Subclasses of AbstractPoolHelper may instead override the protected
 * `create`/`validateResource`/`resetResource`/`onDestroyResource` hooks directly.)
 */
export interface IPoolOptions<T> extends IPoolControlOptions {
  /** Factory to create one resource. */
  create: () => ValueOrPromise<T>;

  /** Teardown on destroy()/discard()/validate-fail/reset-fail. */
  destroy?: (resource: T) => ValueOrPromise<void>;

  /** Checked when an idle resource is about to be handed out; false → destroyed + replaced. */
  validate?: (resource: T) => ValueOrPromise<boolean>;

  /** Run on an idle resource just before hand-out (e.g. clear state). Throw → resource discarded. */
  reset?: (resource: T) => ValueOrPromise<void>;
}

/** One queued acquirer. Cancellation/skip is owned by the FifoQueue; this only carries the settlers. */
export interface IPoolWaiter<T> {
  resolve: (resource: T) => void;
  reject: (error: unknown) => void;
  timer: TNullable<NodeJS.Timeout>;
}
