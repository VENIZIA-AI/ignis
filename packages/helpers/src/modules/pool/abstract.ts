import { TNullable, ValueOrPromise } from '@/common/types';
import { BaseHelper } from '@/modules/base';
import { getError } from '@/modules/error';
import { HfQueueHelper } from '@/modules/queue/internal/hf';
import { IPool, IPoolControlOptions, IPoolStats, IPoolWaiter } from './types';

/**
 * Generic single-borrower object pool — skeleton.
 *
 * Holds all pool state and the pairing logic; subclasses supply the resource lifecycle by overriding
 * {@link create} (required) and, optionally, {@link validateResource} / {@link resetResource} /
 * {@link onDestroyResource}. {@link BasePoolHelper} is the concrete, callback-configured subclass.
 *
 * Every pairing of a resource with a waiting acquirer flows through ONE re-entrancy-guarded
 * `dispatch()` loop, so `acquire`/`release`/`use`/`discard`/`warmup` stay thin; each loop branch
 * delegates to a single-purpose helper (`takeIdleResource`, `createAndHand`, `handToWaiter`).
 *
 * The waiter queue is a generic O(1) {@link HfQueueHelper}: enqueue pushes, dequeue advances a head index
 * (skipping cancelled nodes), and a timed-out acquirer is cancelled in O(1) — no Array.shift/splice
 * on the hot path.
 */
export abstract class AbstractPoolHelper<T> extends BaseHelper implements IPool<T> {
  protected readonly size: number;
  protected readonly acquireTimeoutMs?: number;
  protected readonly maxWaitingClients?: number;

  private readonly idle: T[] = [];
  private readonly borrowed = new Set<T>();
  private readonly waiterQueue = new HfQueueHelper<IPoolWaiter<T>>();

  private total = 0; // live or being-created resources
  private isDispatching = false;
  private isDestroyed = false;

  constructor(opts: IPoolControlOptions) {
    super({ scope: opts.scope ?? 'BasePoolHelper' });
    this.size = opts.size;
    this.acquireTimeoutMs = opts.acquireTimeoutMs;
    this.maxWaitingClients = opts.maxWaitingClients;
  }

  // ----------------------------------------------------------------------------------------------------------

  /** Create one resource. Required. */
  protected abstract create(): ValueOrPromise<T>;

  /** Validate an idle resource just before hand-out; false → destroyed + replaced. Default: always valid. */
  protected validateResource(_opts: { resource: T }): ValueOrPromise<boolean> {
    return true;
  }

  /** Reset an idle resource before hand-out (e.g. clear state). Throw → resource discarded. Default: no-op. */
  protected resetResource(_opts: { resource: T }): ValueOrPromise<void> {
    return undefined;
  }

  /** Tear down a resource being removed from the pool. Default: no-op. */
  protected onDestroyResource(_opts: { resource: T }): ValueOrPromise<void> {
    return undefined;
  }

  // ----------------------------------------------------------------------------------------------------------

  getStats(): IPoolStats {
    return {
      size: this.size,
      available: this.idle.length,
      borrowed: this.borrowed.size,
      pending: this.waiterQueue.size,
    };
  }

  async acquire(): Promise<T> {
    if (this.isDestroyed) {
      throw getError({ message: '[acquire] Pool has been destroyed.' });
    }

    if (this.maxWaitingClients !== undefined && this.maxWaitingClients >= 0) {
      // Only reject when this acquire would actually have to WAIT: no idle resource and the pool is at
      // capacity. With a free/creatable resource the caller is served, so maxWaitingClients:0 means
      // "serve if available, never queue" rather than "reject everything".
      const isWaitRequired = !this.idle.length && this.total >= this.size;

      if (isWaitRequired && this.waiterQueue.size >= this.maxWaitingClients) {
        throw getError({
          message: `[acquire] Too many waiting clients (>= ${this.maxWaitingClients}).`,
        });
      }
    }

    const promise = new Promise<T>((resolve, reject) => {
      const waiter: IPoolWaiter<T> = { resolve, reject, timer: null };
      const node = this.waiterQueue.enqueue({ value: waiter });

      if (this.acquireTimeoutMs !== undefined && this.acquireTimeoutMs >= 0) {
        waiter.timer = setTimeout(() => {
          this.waiterQueue.cancel({ node }); // O(1) — dispatch skips it when reached

          reject(
            getError({
              message: `[acquire] Acquire timed out after ${this.acquireTimeoutMs}ms.`,
            }),
          );
        }, this.acquireTimeoutMs);
      }
    });

    this.safeDispatch({ action: 'acquire' });
    return promise;
  }

  release(opts: { resource: T }): void {
    const { resource } = opts;
    const logger = this.logger.for(this.release.name);

    if (!this.borrowed.has(resource)) {
      logger.warn('Called with a foreign/already-released resource; ignoring.');
      return;
    }
    this.borrowed.delete(resource);

    if (this.isDestroyed) {
      this.destroyResource({ resource }).catch(error => {
        logger.warn('destroyResource error on release: %s', error);
      });
      return;
    }

    this.idle.push(resource);
    this.safeDispatch({ action: 'release' });
  }

  async warmup(): Promise<void> {
    if (this.isDestroyed) {
      throw getError({ message: '[warmup] Pool has been destroyed.' });
    }

    // Create sequentially, re-checking the live `total` before each create so the `size` cap holds
    // under concurrent warmup()/acquire(). createResource() bumps `total` synchronously (before its
    // await), so a re-check here observes in-flight creations from other callers → no overshoot.
    while (this.total < this.size) {
      const resource = await this.createResource();
      this.idle.push(resource);
    }

    this.safeDispatch({ action: 'warmup' });
  }

  async use<R>(opts: { execution: (resource: T) => ValueOrPromise<R> }): Promise<R> {
    const resource = await this.acquire();

    try {
      const result = await opts.execution(resource);
      this.release({ resource });
      return result;
    } catch (error) {
      this.logger
        .for(this.use.name)
        .error('execution threw → release skipped, force DISCARD | Error: %s', error);
      await this.discard({ resource });
      throw error;
    }
  }

  async discard(opts: { resource: T }): Promise<void> {
    const { resource } = opts;

    if (!this.borrowed.delete(resource)) {
      this.logger.for(this.discard.name).warn('Called with a non-borrowed resource; ignoring.');
      return;
    }

    await this.destroyResource({ resource });
    this.safeDispatch({ action: 'discard' });
  }

  async destroy(): Promise<void> {
    this.isDestroyed = true;

    const error = getError({ message: '[destroy] Pool destroyed while awaiting a resource.' });
    const draineds = this.waiterQueue.drain();
    for (const waiter of draineds) {
      this.clearWaiterTimer({ waiter });
      waiter.reject(error);
    }

    const toDestroy = this.idle.splice(0);
    await Promise.all(toDestroy.map(resource => this.destroyResource({ resource })));
  }

  // ----------------------------------------------------------------------------------------------------------

  private async createResource(): Promise<T> {
    this.total += 1; // bump BEFORE await so concurrent dispatch/warmup see the in-flight create (no overshoot)

    try {
      const resource = await this.create();
      return resource;
    } catch (error) {
      this.total -= 1;
      this.logger
        .for(this.createResource.name)
        .error('Error creating pool resource | Error: %s', error);
      throw error;
    }
  }

  private async destroyResource(opts: { resource: T }): Promise<void> {
    this.total -= 1;

    try {
      await this.onDestroyResource(opts);
    } catch (error) {
      this.logger.for(this.destroyResource.name).warn('destroy hook threw: %s', error);
    }
  }

  // ----------------------------------------------------------------------------------------------------------

  /** Fire-and-forget dispatch with logged rejection; shared by all dispatch call sites. */
  private safeDispatch(opts: { action: string }): void {
    this.dispatch().catch(error => {
      this.logger
        .for(this.dispatch.name)
        .warn('dispatch error | action: %s | Error: %s', opts.action, error);
    });
  }

  /**
   * Pair servable resources with waiting acquirers, one at a time, until the queue drains or the
   * pool is exhausted. Re-entrancy-guarded so only one loop runs at a time (others no-op and let this
   * loop finish). Each branch delegates to a single-purpose helper.
   */
  private async dispatch() {
    if (this.isDispatching) {
      return;
    }

    this.isDispatching = true;

    try {
      while (this.waiterQueue.size > 0) {
        // Prefer a warm idle resource (LIFO) over creating a new one.
        if (this.idle.length > 0) {
          const resource = await this.takeIdleResource();
          if (resource === null) {
            continue; // bad idle resource was discarded → try the next one
          }

          if (!this.handToWaiter({ resource })) {
            return;
          }
          continue;
        }

        if (this.total < this.size) {
          await this.createAndHand();
          continue;
        }

        return;
      }
    } catch (error) {
      this.logger
        .for(this.dispatch.name)
        .error('[dispatch] Error while dispatching pool element | Error: %s', error);
    } finally {
      this.isDispatching = false;
    }
  }

  /** Pop an idle resource and validate+reset it; on ANY failure destroy it and return null (caller retries). */
  private async takeIdleResource(): Promise<T | null> {
    const resource = this.idle.pop() as T;
    const logger = this.logger.for(this.takeIdleResource.name);

    let isValid: boolean;
    try {
      isValid = await this.validateResource({ resource });
    } catch (error) {
      // A throwing validate must NOT leak the popped candidate (would corrupt `total` and can
      // permanently starve the pool); treat it like an invalid resource: discard + retry.
      logger.warn('validate hook threw; discarding resource: %s', error);
      await this.destroyResource({ resource });
      return null;
    }

    if (!isValid) {
      await this.destroyResource({ resource });
      return null;
    }

    try {
      await this.resetResource({ resource });
    } catch (error) {
      logger.warn('reset hook threw; discarding resource: %s', error);
      await this.destroyResource({ resource });
      return null;
    }

    return resource;
  }

  /** Create a fresh resource and hand it to the next waiter; on create failure, reject that waiter. */
  private async createAndHand(): Promise<void> {
    let resource: T;
    try {
      resource = await this.createResource();
    } catch (error) {
      this.takeNextWaiter()?.reject(error);
      return;
    }

    this.handToWaiter({ resource });
  }

  /**
   * Give a ready resource to the next live waiter. Returns false when no live waiter remains
   * (raced — e.g. it timed out during an await): the resource is returned to idle instead.
   */
  private handToWaiter(opts: { resource: T }): boolean {
    const { resource } = opts;

    // `destroy()` tears down what it can SEE - the waiter queue and the idle list. A resource whose
    // create() was still in flight is in neither, so parking it in idle now would leave it alive
    // with nothing left to reclaim it.
    if (this.isDestroyed) {
      this.destroyResource({ resource }).catch(error => {
        this.logger
          .for(this.handToWaiter.name)
          .warn('destroyResource error on a resource created after destroy(): %s', error);
      });
      return false;
    }

    const waiter = this.takeNextWaiter();
    if (!waiter) {
      this.idle.push(resource);
      return false;
    }

    this.borrowed.add(resource);
    waiter.resolve(resource);
    return true;
  }

  /** Dequeue the next live waiter and disarm its acquire-timeout so it cannot fire after settlement. */
  private takeNextWaiter(): TNullable<IPoolWaiter<T>> {
    const waiter = this.waiterQueue.dequeue();
    if (waiter) {
      this.clearWaiterTimer({ waiter });
    }
    return waiter;
  }

  private clearWaiterTimer(opts: { waiter: IPoolWaiter<T> }): void {
    const { waiter } = opts;
    if (waiter.timer) {
      clearTimeout(waiter.timer);
      waiter.timer = null;
    }
  }
}
