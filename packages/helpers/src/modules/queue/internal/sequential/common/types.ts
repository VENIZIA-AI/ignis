import { ValueOf, ValueOrPromise } from '@/common/types';

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

export interface IQueueCallback<TElementPayload> {
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
