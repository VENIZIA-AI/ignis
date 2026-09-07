import type { TConstValue } from '@venizia/ignis-helpers/common';
import type { IRedisSingleHelperOptions } from '@venizia/ignis-helpers';
import type { BullMQExecutorModes, MailQueueExecutorTypes } from '../constants';

export interface IMailQueueOptions {
  priority?: number;
  delay?: number;
  attempts?: number;
  backoff?: {
    type: 'fixed' | 'exponential';
    delay: number;
  };
}

export interface IMailProcessorResult {
  success: boolean;
  message: string;
  expiresInMinutes: number;
  nextResendAt?: string;
}

export interface IMailQueueResult {
  jobId?: string;
  queued: boolean;
  message: string;
  result?: IMailProcessorResult;
}

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

export interface IInternalQueueMailExecutorOpts {
  identifier: string;
}

export interface IBullMQMailExecutorOpts {
  redis: IRedisSingleHelperOptions;
  queue: { identifier: string; name: string };
  mode: TConstValue<typeof BullMQExecutorModes>;
}

export interface IMailQueueExecutorConfig {
  type: TConstValue<typeof MailQueueExecutorTypes>;
  internalQueue?: IInternalQueueMailExecutorOpts;
  bullmq?: IBullMQMailExecutorOpts;
}
