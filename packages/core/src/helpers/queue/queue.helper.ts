import { BaseHelper } from '@/base/helpers';
import { ValueOf, ValueOrPromise } from '@/common/types';
import isEmpty from 'lodash/isEmpty';

// --------------------------------------------------------
export class QueueStatuses {
  static readonly WAITING = '000_WAITING';
  static readonly PROCESSING = '100_PROCESSING';
  static readonly LOCKED = '200_LOCKED';
  static readonly SETTLED = '300_SETTLED';

  static readonly SCHEME_SET = new Set([this.WAITING, this.PROCESSING, this.LOCKED, this.SETTLED]);

  static isValid(scheme: string): boolean {
    return this.SCHEME_SET.has(scheme);
  }
}

export type TQueueStatus = ValueOf<Omit<typeof QueueStatuses, 'isValid' | 'SCHEME_SET'>>;
export type TQueueElement<T> = { isLocked: boolean; payload: T };

// --------------------------------------------------------
interface IQueueCallback<TElementPayload> {
  autoDispatch?: boolean;

  onMessage?: (opts: {
    identifier: string;
    queueElement: TQueueElement<TElementPayload>;
  }) => ValueOrPromise<void>;
  onDataEnqueue?: (opts: {
    identifier: string;
    queueElement: TQueueElement<TElementPayload>;
  }) => ValueOrPromise<void>;
  onDataDequeue?: (opts: {
    identifier: string;
    queueElement: TQueueElement<TElementPayload>;
  }) => ValueOrPromise<void>;
  onStateChange?: (opts: {
    identifier: string;
    from: TQueueStatus;
    to: TQueueStatus;
  }) => ValueOrPromise<void>;
}

// --------------------------------------------------------
export class QueueHelper<TElementPayload> extends BaseHelper {
  public storage: Array<TQueueElement<TElementPayload>>;
  protected processingEvents: Set<TQueueElement<TElementPayload>>;
  protected generator: Generator;

  protected totalEvent: number;
  protected autoDispatch: boolean = true;
  protected state: TQueueStatus = QueueStatuses.WAITING;
  protected isSettleRequested: boolean;

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
    super({ scope: `${QueueHelper.name}_${opts.identifier}`, identifier: opts.identifier });

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
  }

  protected async handleMessage() {
    const current = this.getElementAt(0);
    if (!current) {
      this.logger.warn('[handleMessage] current: %j | Invalid current message to handle!', current);
      return;
    }

    const { isLocked, payload } = current;
    if (isLocked) {
      this.logger.info('[handle] Skip LOCKED message | Payload: %j', payload);
      return;
    }

    if (this.state !== QueueStatuses.LOCKED && this.state !== QueueStatuses.SETTLED) {
      const snap = this.state;
      this.state = QueueStatuses.PROCESSING;
      await this.onStateChange?.({ identifier: this.identifier, from: snap, to: this.state });
    }

    this.getElementAt(0).isLocked = true;

    this.processingEvents.add(this.getElementAt(0));
    await this.onMessage?.({ identifier: this.identifier, queueElement: this.getElementAt(0) });

    const doneElement = this.dequeue();
    if (doneElement) {
      this.processingEvents.delete(doneElement);
    }

    if (this.state !== QueueStatuses.LOCKED && this.state !== QueueStatuses.SETTLED) {
      const snap = this.state;
      this.state = QueueStatuses.WAITING;
      await this.onStateChange?.({ identifier: this.identifier, from: snap, to: this.state });
    }

    if (!this.storage.length) {
      if (this.isSettleRequested) {
        const snap = this.state;
        this.state = QueueStatuses.SETTLED;
        await this.onStateChange?.({ identifier: this.identifier, from: snap, to: this.state });
      }

      return;
    }

    this.nextMessage();
  }

  private *_messageListener() {
    if (!this.onMessage) {
      this.logger.warn(
        '[_messageListener] Queue has no onMessage listener | Skip initializing message iterator!',
      );
      return;
    }

    while (true) {
      yield this.handleMessage();
    }
  }

  nextMessage() {
    if (this.state !== QueueStatuses.WAITING) {
      this.logger.warn(
        '[nextMessage] SKIP request next message | Invalid queue state to request next message | currentState: %s',
        this.state,
      );
      return;
    }

    this.generator.next();
  }

  async enqueue(payload: TElementPayload) {
    if (this.isSettleRequested || this.state === QueueStatuses.SETTLED) {
      this.logger.error(
        '[enqueue] isSettled: %s | currentState: %s | Queue was SETTLED | No more element acceptable',
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
    this.storage.push(queueElement);
    this.totalEvent++;
    await this.onDataEnqueue?.({ identifier: this.identifier, queueElement: queueElement });

    if (this.autoDispatch) {
      this.nextMessage();
    }
  }

  dequeue() {
    const value = this.storage.shift();

    if (value && !isEmpty(value)) {
      this.onDataDequeue?.({ identifier: this.identifier, queueElement: value });
    }

    return value;
  }

  lock() {
    if (this.state >= QueueStatuses.LOCKED) {
      this.logger.error(
        '[lock] isSettled | currentState: %s | Invalid queue state to request lock queue!',
        this.isSettleRequested,
        this.state,
      );
      return;
    }

    const snap = this.state;
    this.state = QueueStatuses.LOCKED;
    this.onStateChange?.({ identifier: this.identifier, from: snap, to: this.state });
  }

  unlock(opts: { shouldProcessNextElement?: boolean }) {
    if (this.state > QueueStatuses.LOCKED) {
      this.logger.error(
        '[unlock] isSettled | currentState: %s | Invalid queue state to request unlock queue!',
        this.isSettleRequested,
        this.state,
      );
      return;
    }

    const { shouldProcessNextElement = true } = opts;

    const snap = this.state;
    this.state = QueueStatuses.WAITING;
    this.onStateChange?.({ identifier: this.identifier, from: snap, to: this.state });

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
      this.onStateChange?.({ identifier: this.identifier, from: snap, to: this.state });
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

// --------------------------------------------------------
/* export class MultiQueueHelper<ElementType> {
  public storage: Record<string, QueueHelper<ElementType>>;

  private onDataEnqueue?: (identifier: string, payload: ElementType) => void;
  private onDataDequeue?: (identifier: string, payload: ElementType) => void;

  constructor(opts: IQueueCallback<ElementType>) {
    const { onDataEnqueue, onDataDequeue } = opts;
    this.onDataEnqueue = onDataEnqueue;
    this.onDataDequeue = onDataDequeue;
    this.storage = {};
  }

  enqueue(identifier: string, value: ElementType) {
    if (!this.storage[identifier]) {
      this.storage[identifier] = new QueueHelper({ identifier });
    }

    this.storage[identifier].enqueue(value);

    if (value && !isEmpty(value)) {
      this.onDataEnqueue?.(identifier, value);
    }
  }

  dequeue(identifier: string): ElementType | undefined {
    const value = this.storage[identifier]?.dequeue();

    if (value && !isEmpty(value)) {
      this.onDataDequeue?.(identifier, value);
    }

    return value;
  }

  getElementAt(identifier: string, position = 0) {
    return this.storage[identifier].getElementAt(position);
  }

  getCurrentData(identifier: string) {
    return this.storage[identifier]?.getElementAt(0);
  }

  getQueue(identifier: string) {
    return this.storage[identifier];
  }

  removeQueue(queue: string) {
    this.storage = omit(this.storage, [queue]);
  }

  mapData() {
    return this.storage;
  }
} */
