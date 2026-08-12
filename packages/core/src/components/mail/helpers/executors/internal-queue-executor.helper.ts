import { BaseHelper, getError } from '@venizia/ignis-helpers/core';
import { SequentialQueueHelper } from '@venizia/ignis-helpers';
import type {
  IMailQueueOptions,
  IMailQueueExecutor,
  IMailProcessorResult,
  IInternalQueueMailExecutorOpts,
  IMailQueueResult,
  IQueueJobPayload,
} from '../../common';
import { MailErrorCodes, MailExecutorErrors } from '../../common';

export class InternalQueueMailExecutorHelper extends BaseHelper implements IMailQueueExecutor {
  private queue: SequentialQueueHelper<IQueueJobPayload>;
  private jobIdCounter = 0;
  private delayedJobs: Map<string, NodeJS.Timeout> = new Map();

  private processor?: (email: string) => Promise<IMailProcessorResult>;

  constructor(opts: IInternalQueueMailExecutorOpts) {
    super({ scope: InternalQueueMailExecutorHelper.name });

    this.queue = new SequentialQueueHelper<IQueueJobPayload>({
      identifier: opts.identifier,
      autoDispatch: true,
      onMessage: async ({ queueElement }) => {
        await this.processJob(queueElement.payload);
      },
      onDataEnqueue: ({ queueElement }) => {
        this.logger
          .for('onDataEnqueue')
          .info(
            'Job enqueued | jobId: %s | email: %s',
            queueElement.payload.id,
            queueElement.payload.email,
          );
      },
      onStateChange: ({ from, to }) => {
        this.logger.for('onStateChange').debug('Queue state changed | from: %s | to: %s', from, to);
      },
    });

    this.logger.for(this.constructor.name).info('Internal queue executor initialized');
  }

  setProcessor(processor: (email: string) => Promise<IMailProcessorResult>): void {
    this.processor = processor;
    this.logger.for(this.setProcessor.name).info('Processor registered');
  }

  async enqueueVerificationEmail(
    email: string,
    options?: IMailQueueOptions,
  ): Promise<IMailQueueResult> {
    if (!this.processor) {
      throw getError({ message: MailExecutorErrors.PROCESSOR_NOT_SET });
    }

    const jobId = `job_${++this.jobIdCounter}_${Date.now()}`;
    const job: IQueueJobPayload = {
      id: jobId,
      email,
      options,
      attempts: 0,
      scheduledAt: Date.now() + (options?.delay ?? 0),
    };

    this.logger
      .for(this.enqueueVerificationEmail.name)
      .info('Queuing email | jobId: %s | email: %s', jobId, email);

    if (options?.delay && options.delay > 0) {
      const timeout = setTimeout(() => {
        this.queue.enqueue(job).catch(error => {
          this.logger
            .for(this.enqueueVerificationEmail.name)
            .error('Failed to enqueue delayed job | jobId: %s | error: %s', jobId, error);
        });
        this.delayedJobs.delete(jobId);
      }, options.delay);

      this.delayedJobs.set(jobId, timeout);

      this.logger
        .for(this.enqueueVerificationEmail.name)
        .info('Job scheduled with delay | jobId: %s | delay: %dms', jobId, options.delay);
    } else {
      await this.queue.enqueue(job);
    }

    return {
      jobId,
      queued: true,
      message: 'Email queued successfully (internal queue)',
    };
  }

  /** Releases every pending delayed/backoff timer - a live `setTimeout` holds the event loop open past the executor. */
  async close(): Promise<void> {
    const pendingCount = this.delayedJobs.size;

    for (const timeout of this.delayedJobs.values()) {
      clearTimeout(timeout);
    }

    this.delayedJobs.clear();

    this.logger.for(this.close.name).info('Executor closed | Cleared timers: %d', pendingCount);
  }

  private async processJob(job: IQueueJobPayload): Promise<void> {
    if (!this.processor) {
      this.logger.for(this.processJob.name).error('Processor not set | jobId: %s', job.id);
      return;
    }

    const maxAttempts = job.options?.attempts ?? 3;

    this.logger
      .for(this.processJob.name)
      .info(
        'Processing job | jobId: %s | email: %s | attempt: %d/%d',
        job.id,
        job.email,
        job.attempts + 1,
        maxAttempts,
      );

    try {
      const result = await this.processor(job.email);

      // A processor reports SMTP rejection by RETURNING `{ success: false }`; watching only for throws completes the job and drops the mail.
      if (result?.success === false) {
        throw getError({
          messageCode: MailErrorCodes.SEND_FAILED,
          message: `[processJob] Processor reported failure | jobId: ${job.id} | reason: ${result.message}`,
        });
      }

      this.logger.for(this.processJob.name).info('Job completed successfully | jobId: %s', job.id);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : error;
      job.attempts++;

      if (job.attempts < maxAttempts) {
        const backoffDelay = this.calculateBackoff(job);

        this.logger
          .for(this.processJob.name)
          .warn(
            'Job failed, retrying | jobId: %s | attempt: %d/%d | retryIn: %dms | error: %s',
            job.id,
            job.attempts,
            maxAttempts,
            backoffDelay,
            errorMsg,
          );

        const timeout = setTimeout(() => {
          this.queue.enqueue(job).catch(reenqueueError => {
            this.logger
              .for(this.processJob.name)
              .error('Failed to re-enqueue job | jobId: %s | error: %s', job.id, reenqueueError);
          });
          this.delayedJobs.delete(job.id);
        }, backoffDelay);

        this.delayedJobs.set(job.id, timeout);
      } else {
        this.logger
          .for(this.processJob.name)
          .error(
            'Job failed permanently after %d attempts | jobId: %s | error: %s',
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

    return backoff.delay;
  }
}
