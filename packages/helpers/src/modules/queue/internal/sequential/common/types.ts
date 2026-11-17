import { type TConstValue, type ValueOrPromise } from '@/common/types';

/** Lifecycle states of a sequential queue; the numeric prefix orders them. */
export class QueueStatuses {
  static readonly WAITING = '000_WAITING';
  static readonly PROCESSING = '100_PROCESSING';
  static readonly LOCKED = '200_LOCKED';
  static readonly SETTLED = '300_SETTLED';
}

/** A {@link QueueStatuses} value. */
export type TQueueStatus = TConstValue<typeof QueueStatuses>;
/** One queued item: `payload`, plus `isLocked` while a handler holds it. */
export type TQueueElement<T> = { isLocked: boolean; payload: T };

/** Hooks of a sequential queue. */
export interface IQueueCallback<TElementPayload> {
  /**
   * Whether {@link SequentialQueueHelper} dispatches an element on its own.
   * @default true
   */
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
