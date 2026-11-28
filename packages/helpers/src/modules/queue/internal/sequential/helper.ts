import { ObjectUtility } from '@venizia/ignis-inversion';
import { AsyncLocalStorage } from 'node:async_hooks';
import { type ValueOrPromise } from '@/common/types';
import { BaseHelper } from '@/modules/base';
import { HookUtility } from '../../common';
import {
  type IQueueCallback,
  QueueStatuses,
  type TQueueElement,
  type TQueueStatus,
} from './common';
import { ExecutionFrames } from '@/modules/execution';

/** Calls `task` in the async context captured when the runner was made. */
type TContextRunner = <Result>(task: () => Result) => Result;

/**
 * In-memory FIFO queue that hands one element at a time to `onMessage`.
 * A throwing handler is logged and its element dropped, so the queue keeps moving.
 *
 * Each element is handled in the async context it was enqueued in, so a handler reads the stores of the caller that
 * enqueued it, not the ones of the element before. Its execution frame is not the caller's: a scoped root frame with
 * the user and the values captured at enqueue, never the request or system rights. An element pushed straight into
 * `storage` is handled in the context the queue was built in, with no identity.
 */
export class SequentialQueueHelper<TElementPayload> extends BaseHelper {
  public storage: Array<TQueueElement<TElementPayload>>;
  protected processingEvents: Set<TQueueElement<TElementPayload>>;
  protected generator: Generator;

  protected totalEvent: number;
  protected autoDispatch: boolean = true;
  protected state: TQueueStatus = QueueStatuses.WAITING;
  protected isSettleRequested: boolean;

  private readonly elementContexts = new WeakMap<TQueueElement<TElementPayload>, TContextRunner>();
  private ownContext!: TContextRunner;

  private onMessage?: (opts: {
    identifier: string;
    queueElement: TQueueElement<TElementPayload>;
  }) => ValueOrPromise<void>;

  private onDataEnqueue?: (opts: {
    identifier: string;
    queueElement: TQueueElement<TElementPayload>;
  }) => ValueOrPromise<void>;

  private onDataDequeue?: (opts: {
    identifier: string;
    queueElement: TQueueElement<TElementPayload>;
  }) => ValueOrPromise<void>;

  private onStateChange?: (opts: {
    identifier: string;
    from: TQueueStatus;
    to: TQueueStatus;
  }) => ValueOrPromise<void>;

  constructor(opts: IQueueCallback<TElementPayload> & { identifier: string }) {
    super({
      scope: `${SequentialQueueHelper.name}_${opts.identifier}`,
      identifier: opts.identifier,
    });

    this.identifier = opts.identifier;
    this.storage = [];
    this.processingEvents = new Set([]);
    this.generator = this._messageListener();

    this.totalEvent = 0;
    this.autoDispatch = opts.autoDispatch ?? true;
    this.state = QueueStatuses.WAITING;
    this.isSettleRequested = false;

    this.onMessage = opts.onMessage;
    this.onDataEnqueue = opts.onDataEnqueue;
    this.onDataDequeue = opts.onDataDequeue;
    this.onStateChange = opts.onStateChange;
    this.ownContext = this.captureContext({ run: (task) => ExecutionFrames.root({ task }) });
  }

  /**
   * The context a later dispatch runs in: the async context of the caller, with its frame replaced first by `run`, so
   * nothing runs between entering the snapshot and opening that frame.
   */
  private captureContext(opts: { run: TContextRunner }): TContextRunner {
    const snapshot = AsyncLocalStorage.snapshot();

    return (task) => snapshot(() => opts.run(task));
  }

  /** Announce a state transition, awaiting the hook but never letting it break the caller. */
  protected notifyStateChange(opts: { scope: string; from: TQueueStatus }): Promise<void> {
    const { scope, from } = opts;

    return HookUtility.execute({
      logger: this.logger,
      scope,
      execution: () => this.onStateChange?.({ identifier: this.identifier, from, to: this.state }),
    });
  }

  /** Announce a state transition from a synchronous caller (lock/unlock/settle) - fire-and-forget. */
  protected notifyStateChangeAsync(opts: { scope: string; from: TQueueStatus }): void {
    const { scope, from } = opts;

    HookUtility.invoke({
      logger: this.logger,
      scope,
      execution: () => this.onStateChange?.({ identifier: this.identifier, from, to: this.state }),
    });
  }

  /**
   * Handles the element at the head, in its own context: the next dispatch is chained from the previous element's
   * handling, whose context must not reach it.
   */
  protected handleMessage() {
    const head = this.getElementAt(0);
    const run = (head && this.elementContexts.get(head)) ?? this.ownContext;

    return run(() => this.processHead());
  }

  private async processHead() {
    const current = this.getElementAt(0);

    if (!current) {
      this.logger
        .for(this.handleMessage.name)
        .warn('current: %j | Invalid current message to handle!', current);

      return;
    }

    const { isLocked, payload } = current;

    if (isLocked) {
      this.logger.for('handle').info('Skip LOCKED message | Payload: %j', payload);

      return;
    }

    if (this.state !== QueueStatuses.LOCKED && this.state !== QueueStatuses.SETTLED) {
      const snap = this.state;
      this.state = QueueStatuses.PROCESSING;
      await this.notifyStateChange({ scope: this.handleMessage.name, from: snap });
    }

    this.getElementAt(0).isLocked = true;

    this.processingEvents.add(this.getElementAt(0));

    // A failing handler must never leave the queue PROCESSING forever: the element would stay LOCKED at the head, nextMessage() would refuse every dispatch and storage would grow without bound. The handler owns its retry policy - here the element is logged, dropped, and the queue moves on.
    await HookUtility.execute({
      logger: this.logger,
      scope: this.handleMessage.name,
      execution: () =>
        this.onMessage?.({ identifier: this.identifier, queueElement: this.getElementAt(0) }),
    });

    const doneElement = this.dequeue();

    if (doneElement) {
      this.processingEvents.delete(doneElement);
    }

    if (this.state !== QueueStatuses.LOCKED && this.state !== QueueStatuses.SETTLED) {
      const snap = this.state;
      this.state = QueueStatuses.WAITING;
      await this.notifyStateChange({ scope: this.handleMessage.name, from: snap });
    }

    if (!this.storage.length) {
      if (this.isSettleRequested) {
        const snap = this.state;
        this.state = QueueStatuses.SETTLED;
        await this.notifyStateChange({ scope: this.handleMessage.name, from: snap });
      }

      return;
    }

    this.nextMessage();
  }

  private *_messageListener() {
    if (!this.onMessage) {
      this.logger
        .for('_messageListener')
        .warn('Queue has no onMessage listener | Skip initializing message iterator!');

      return;
    }

    while (true) {
      yield this.handleMessage();
    }
  }

  nextMessage() {
    if (this.state !== QueueStatuses.WAITING) {
      this.logger
        .for(this.nextMessage.name)
        .warn(
          'SKIP request next message | Invalid queue state to request next message | currentState: %s',
          this.state,
        );

      return;
    }

    this.generator.next();
  }

  async enqueue(payload: TElementPayload) {
    if (this.isSettleRequested || this.state === QueueStatuses.SETTLED) {
      this.logger
        .for(this.enqueue.name)
        .error(
          'isSettled: %s | currentState: %s | Queue was SETTLED | No more element acceptable',
          this.isSettleRequested,
          this.state,
        );

      return;
    }

    if (!this.storage) {
      this.storage = [];
    }

    if (!payload) {
      return;
    }

    const queueElement: TQueueElement<TElementPayload> = { isLocked: false, payload };
    const run = ExecutionFrames.handOff({ name: this.identifier });
    this.elementContexts.set(queueElement, this.captureContext({ run }));
    this.storage.push(queueElement);
    this.totalEvent++;
    await HookUtility.execute({
      logger: this.logger,
      scope: this.enqueue.name,
      execution: () => this.onDataEnqueue?.({ identifier: this.identifier, queueElement }),
    });

    if (this.autoDispatch) {
      this.nextMessage();
    }
  }

  dequeue() {
    const value = this.storage.shift();

    if (value && !ObjectUtility.isEmpty({ value: value })) {
      HookUtility.invoke({
        logger: this.logger,
        scope: this.dequeue.name,
        execution: () => this.onDataDequeue?.({ identifier: this.identifier, queueElement: value }),
      });
    }

    return value;
  }

  lock() {
    if (this.state >= QueueStatuses.LOCKED) {
      this.logger
        .for(this.lock.name)
        .error(
          'isSettled | currentState: %s | Invalid queue state to request lock queue!',
          this.isSettleRequested,
          this.state,
        );

      return;
    }

    const snap = this.state;
    this.state = QueueStatuses.LOCKED;
    this.notifyStateChangeAsync({ scope: this.lock.name, from: snap });
  }

  unlock(opts: { shouldProcessNextElement?: boolean }) {
    if (this.state > QueueStatuses.LOCKED) {
      this.logger
        .for(this.unlock.name)
        .error(
          'isSettled | currentState: %s | Invalid queue state to request unlock queue!',
          this.isSettleRequested,
          this.state,
        );

      return;
    }

    const { shouldProcessNextElement = true } = opts;

    const snap = this.state;
    this.state = QueueStatuses.WAITING;
    this.notifyStateChangeAsync({ scope: this.unlock.name, from: snap });

    if (!shouldProcessNextElement) {
      return;
    }

    this.nextMessage();
  }

  settle() {
    this.isSettleRequested = true;

    if (this.state !== QueueStatuses.PROCESSING) {
      const snap = this.state;
      this.state = QueueStatuses.SETTLED;
      this.notifyStateChangeAsync({ scope: this.settle.name, from: snap });
    }
  }

  isSettled() {
    return this.state === QueueStatuses.SETTLED && !this.storage.length;
  }

  close() {
    this.settle();
    this.generator.return({
      state: this.state,
      totalEvent: this.totalEvent,
    });
  }

  getElementAt(position: number) {
    return this.storage[position];
  }

  getState() {
    return this.state;
  }

  getTotalEvent() {
    return this.totalEvent;
  }

  getProcessingEvents() {
    return this.processingEvents;
  }
}
