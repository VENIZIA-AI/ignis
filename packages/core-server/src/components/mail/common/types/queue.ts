import type { TMailBackoffType } from '../constants';
import type { TConstValue, ValueOrPromise } from '@venizia/ignis-helpers/common';
import type { IRedisHelper } from '@venizia/ignis-helpers';
import type { BullMQExecutorModes, MailQueueExecutorTypes } from '../constants';

/** Per-job options for a queued verification mail. `delay` and `backoff.delay` are milliseconds; `attempts` is the total number of tries, first included. */
export interface IMailQueueOptions {
  priority?: number;
  delay?: number;
  attempts?: number;
  backoff?: {
    type: TMailBackoffType;
    delay: number;
  };
}

/** Result a queue processor returns for one verification mail; returning `success: false` marks the job failed so it is retried. */
export interface IMailProcessorResult {
  success: boolean;
  message: string;
  expiresInMinutes: number;
  nextResendAt?: string;
}

/** Result of enqueueing a verification mail; `queued` is `false` and `result` is set when the executor ran the mail inline. */
export interface IMailQueueResult {
  jobId?: string;
  queued: boolean;
  message: string;
  result?: IMailProcessorResult;
}

/** Queues verification mails and runs them through the processor registered with `setProcessor`. */
export interface IMailQueueExecutor {
  enqueueVerificationEmail(email: string, options?: IMailQueueOptions): Promise<IMailQueueResult>;
  setProcessor(processor: (email: string) => Promise<IMailProcessorResult>): ValueOrPromise<void>;
  /** Releases what the executor holds: timers, workers, the queue. The application stop hook calls it. */
  close?(): Promise<void>;
}

/** Envelope every queue-backed executor stores for one pending verification email. */
export interface IQueueJobPayload {
  id: string;
  email: string;
  options?: IMailQueueOptions;
  attempts: number;
  scheduledAt: number;
}

/** Options of the in-process queue executor; `identifier` names its queue. */
export interface IInternalQueueMailExecutorOpts {
  identifier: string;
}

/** Options of the BullMQ mail executor: the Redis helper, the queue `identifier` and BullMQ `name`, and which of queue and workers this process runs. */
export interface IBullMQMailExecutorOpts {
  /**
   * A ready single, cluster or sentinel helper. The queue and each worker duplicate its client, and the
   * application closes it: the executor never disconnects a connection it did not create. On a cluster
   * the queue name is wrapped in a `{hash tag}` so its keys share one slot.
   */
  redis: IRedisHelper;
  queue: { identifier: string; name: string };
  mode: TConstValue<typeof BullMQExecutorModes>;
  /** `bullmq` itself, for a `bun build --compile` binary that has no `node_modules` to load it from. */
  module?: typeof import('bullmq');
}

/** Selects and configures the mail queue executor: `type` picks one of three, and the options its executor needs are required by the types. */
export type TMailQueueExecutorConfig =
  | { type: typeof MailQueueExecutorTypes.DIRECT; options?: never }
  | {
      type: typeof MailQueueExecutorTypes.INTERNAL_QUEUE;
      options: IInternalQueueMailExecutorOpts;
    }
  | { type: typeof MailQueueExecutorTypes.BULLMQ; options: IBullMQMailExecutorOpts };
