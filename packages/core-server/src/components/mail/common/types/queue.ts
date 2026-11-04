import type { TMailBackoffType } from '../constants';
import type { TConstValue } from '@venizia/ignis-helpers/common';
import type { IRedisSingleHelperOptions } from '@venizia/ignis-helpers';
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
  setProcessor(processor: (email: string) => Promise<IMailProcessorResult>): void;
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

/** Options of the BullMQ mail executor: the Redis connection, the queue `identifier` and BullMQ `name`, and which of queue and workers this process runs. */
export interface IBullMQMailExecutorOpts {
  /** `redis.module` passes `ioredis` itself - see `module` below for why. */
  redis: IRedisSingleHelperOptions;
  queue: { identifier: string; name: string };
  mode: TConstValue<typeof BullMQExecutorModes>;
  /** `bullmq` itself, for a `bun build --compile` binary that has no `node_modules` to load it from. */
  module?: typeof import('bullmq');
}

/** Selects and configures the mail queue executor; the field matching `type` (`internalQueue` or `bullmq`) is required for that type. */
export interface IMailQueueExecutorConfig {
  type: TConstValue<typeof MailQueueExecutorTypes>;
  internalQueue?: IInternalQueueMailExecutorOpts;
  bullmq?: IBullMQMailExecutorOpts;
}
