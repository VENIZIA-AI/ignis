import { BaseHelper, getError, QueueHelper } from '@/helpers';
import {
  IMailQueueOptions,
  IMailQueueExecutor,
  IMailProcessorResult,
  IInternalQueueMailExecutorOpts,
  IMailQueueResult,
} from '../../common';

interface IQueueJobPayload {
  id: string;
  email: string;
  options?: IMailQueueOptions;
  attempts: number;
  scheduledAt: number;
}

export class InternalQueueMailExecutorHelper extends BaseHelper implements IMailQueueExecutor {
  private queue: QueueHelper<IQueueJobPayload>;
  private jobIdCounter = 0;
  private delayedJobs: Map<string, NodeJS.Timeout> = new Map();

  private processor?: (email: string) => Promise<IMailProcessorResult>;

  constructor(opts: IInternalQueueMailExecutorOpts) {
    super({ scope: InternalQueueMailExecutorHelper.name });

    this.queue = new QueueHelper<IQueueJobPayload>({
      identifier: opts.identifier,
      autoDispatch: true,
      onMessage: async ({ queueElement }) => {
        await this.processJob(queueElement.payload);
      },
      onDataEnqueue: ({ queueElement }) => {
        this.logger.info(
          '[onDataEnqueue] Job enqueued | jobId: %s | email: %s',
          queueElement.payload.id,
          queueElement.payload.email,
        );
      },
      onStateChange: ({ from, to }) => {
        this.logger.debug('[onStateChange] Queue state changed | from: %s | to: %s', from, to);
      },
    });

    this.logger.info('[constructor] Internal queue executor initialized');
  }

  setProcessor(
    processor: (email: string) => Promise<{
      success: boolean;
      message: string;
      expiresInMinutes: number;
      nextResendAt?: string;
    }>,
  ): void {
    this.processor = processor;
    this.logger.info('[setProcessor] Processor registered');
  }

  async enqueueVerificationEmail(
    email: string,
    options?: IMailQueueOptions,
  ): Promise<IMailQueueResult> {
    if (!this.processor) {
      throw getError({ message: 'Processor not set. Call setProcessor() first.' });
    }

    const jobId = `job_${++this.jobIdCounter}_${Date.now()}`;
    const job: IQueueJobPayload = {
      id: jobId,
      email,
      options,
      attempts: 0,
      scheduledAt: Date.now() + (options?.delay ?? 0),
    };

    this.logger.info(
      '[enqueueVerificationEmail] Queuing email | jobId: %s | email: %s',
      jobId,
      email,
    );

    if (options?.delay && options.delay > 0) {
      const timeout = setTimeout(() => {
        this.queue.enqueue(job);
        this.delayedJobs.delete(jobId);
      }, options.delay);

      this.delayedJobs.set(jobId, timeout);

      this.logger.info(
        '[enqueueVerificationEmail] Job scheduled with delay | jobId: %s | delay: %dms',
        jobId,
        options.delay,
      );
    } else {
      await this.queue.enqueue(job);
    }

    return {
      jobId,
      queued: true,
      message: 'Email queued successfully (internal queue)',
    };
  }

  private async processJob(job: IQueueJobPayload): Promise<void> {
    if (!this.processor) {
      this.logger.error('[processJob] Processor not set | jobId: %s', job.id);
      return;
    }

    const maxAttempts = job.options?.attempts ?? 3;

    this.logger.info(
      '[processJob] Processing job | jobId: %s | email: %s | attempt: %d/%d',
      job.id,
      job.email,
      job.attempts + 1,
      maxAttempts,
    );

    try {
      await this.processor(job.email);
      this.logger.info('[processJob] Job completed successfully | jobId: %s', job.id);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : error;
      job.attempts++;

      if (job.attempts < maxAttempts) {
        const backoffDelay = this.calculateBackoff(job);

        this.logger.warn(
          '[processJob] Job failed, retrying | jobId: %s | attempt: %d/%d | retryIn: %dms | error: %s',
          job.id,
          job.attempts,
          maxAttempts,
          backoffDelay,
          errorMsg,
        );

        // Re-enqueue with delay
        const timeout = setTimeout(() => {
          this.queue.enqueue(job);
          this.delayedJobs.delete(job.id);
        }, backoffDelay);

        this.delayedJobs.set(job.id, timeout);
      } else {
        this.logger.error(
          '[processJob] Job failed permanently after %d attempts | jobId: %s | error: %s',
          maxAttempts,
          job.id,
          errorMsg,
        );
      }
    }
  }

  private calculateBackoff(job: IQueueJobPayload): number {
    const backoff = job.options?.backoff;

    if (!backoff) {
      return 1000;
    }

    if (backoff.type === 'exponential') {
      return backoff.delay * Math.pow(2, job.attempts - 1);
    }

    // Fixed delay
    return backoff.delay;
  }
}
