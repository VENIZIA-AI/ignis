import { BaseHelper, getError, RedisSingleHelper } from '@venizia/ignis-helpers';
import type { TConstValue } from '@/helpers';
import { BullMQHelper } from '@venizia/ignis-helpers/bullmq';
import type {
  IBullMQMailExecutorOpts,
  IMailProcessorResult,
  IMailQueueExecutor,
  IMailQueueOptions,
  IMailQueueResult,
  IQueueJobPayload,
} from '../../common';
import { BullMQExecutorModes, MailErrorCodes, MailExecutorErrors } from '../../common';
import type { Job } from 'bullmq';

export class BullMQMailExecutorHelper extends BaseHelper implements IMailQueueExecutor {
  private queueIdentifier: string;
  private queueName: string;
  private mode: TConstValue<typeof BullMQExecutorModes>;

  private queueHelper?: BullMQHelper<IQueueJobPayload, IMailQueueResult>;
  private workerHelpers: BullMQHelper<IQueueJobPayload, IMailProcessorResult>[] = [];
  private redisConnection: RedisSingleHelper;
  private jobIdCounter = 0;

  private processor?: (email: string) => Promise<IMailProcessorResult>;

  constructor(opts: IBullMQMailExecutorOpts) {
    super({ scope: BullMQMailExecutorHelper.name });

    this.mode = opts.mode;

    this.redisConnection = new RedisSingleHelper({
      ...opts.redis,
      maxRetry: undefined,
    });

    this.queueIdentifier = opts.queue.identifier;
    this.queueName = opts.queue.name;

    this.initQueue(opts.queue);
  }

  initQueue(queue: { identifier: string; name: string }) {
    switch (this.mode) {
      case BullMQExecutorModes.QUEUE_ONLY:
      case BullMQExecutorModes.BOTH: {
        this.queueHelper = new BullMQHelper<IQueueJobPayload, IMailQueueResult>({
          identifier: queue.identifier,
          queueName: queue.name,
          redisConnection: this.redisConnection,
          role: 'queue',
        });

        this.logger
          .for(this.constructor.name)
          .info(
            'BullMQ queue executor initialized (queue enabled) | Identifier: %s | Mode: %s',
            this.queueIdentifier,
            this.mode,
          );
        break;
      }
      default: {
        this.logger
          .for(this.constructor.name)
          .info(
            'BullMQ queue executor initialized (worker-only mode) | Identifier: %s | Mode: %s',
            this.queueIdentifier,
            this.mode,
          );

        break;
      }
    }
  }

  async setProcessor(
    processor: (email: string) => Promise<IMailProcessorResult>,
    opts?: {
      numberOfWorkers?: number;
      concurrencyPerWorker?: number;
      lockDuration?: number;
    },
  ): Promise<void> {
    this.processor = processor;

    if (this.mode === BullMQExecutorModes.QUEUE_ONLY) {
      this.logger
        .for(this.setProcessor.name)
        .warn('Skipping worker creation in queue-only mode. Workers will not be started.');
      return;
    }

    const numberOfWorkers = opts?.numberOfWorkers ?? 1;
    const concurrencyPerWorker = opts?.concurrencyPerWorker ?? 5;
    const lockDuration = opts?.lockDuration ?? 30000;

    await this.clearWorkers();

    for (let i = 0; i < numberOfWorkers; i++) {
      this.addWorker({
        workerIdentifier: `${this.queueIdentifier}-worker-${i}`,
        concurrency: concurrencyPerWorker,
        lockDuration,
      });
    }

    this.logger
      .for(this.setProcessor.name)
      .info(
        'Processor registered | Mode: %s | Workers: %d | Concurrency per worker: %d',
        this.mode,
        numberOfWorkers,
        concurrencyPerWorker,
      );
  }

  addWorker(opts: { workerIdentifier: string; concurrency?: number; lockDuration?: number }): void {
    if (!this.processor) {
      throw getError({ message: MailExecutorErrors.PROCESSOR_NOT_SET });
    }

    const workerIdentifier = opts.workerIdentifier;
    const concurrency = opts?.concurrency ?? 5;
    const lockDuration = opts?.lockDuration ?? 30000;

    const workerHelper = new BullMQHelper<IQueueJobPayload, IMailProcessorResult>({
      identifier: workerIdentifier,
      queueName: this.queueName,
      redisConnection: this.redisConnection,
      role: 'worker',
      numberOfWorker: concurrency,
      lockDuration,
      onWorkerData: async (job: Job<IQueueJobPayload, IMailProcessorResult>) => {
        const maxAttempts = job.data.options?.attempts ?? 3;

        this.logger
          .for('onWorkerData')
          .info(
            'Processing job | Worker: %s | jobId: %s | email: %s | attempt: %d/%d',
            workerIdentifier,
            job.data.id,
            job.data.email,
            job.attemptsMade + 1,
            maxAttempts,
          );

        if (!this.processor) {
          // Returning undefined would let BullMQ mark the job COMPLETED and (with removeOnComplete) delete it - mail silently dropped.
          throw getError({
            messageCode: MailErrorCodes.SEND_FAILED,
            message: `[onWorkerData] ${MailExecutorErrors.PROCESSOR_NOT_SET} | jobId: ${job.data.id}`,
          });
        }

        const result = await this.processor(job.data.email);

        // A processor reports SMTP rejection by RETURNING `{ success: false }`; BullMQ only treats a REJECTION as failure, so resolving completes the job - no retry, no DLQ.
        if (result?.success === false) {
          throw getError({
            messageCode: MailErrorCodes.SEND_FAILED,
            message: `[onWorkerData] Processor reported failure | jobId: ${job.data.id} | reason: ${result.message}`,
          });
        }

        return result;
      },
      onWorkerDataCompleted: async (job: Job<IQueueJobPayload, IMailProcessorResult>) => {
        this.logger
          .for('onWorkerDataCompleted')
          .info(
            'Job completed | Worker: %s | jobId: %s | email: %s',
            workerIdentifier,
            job.data.id,
            job.data.email,
          );
      },
      onWorkerDataFail: async (
        job: Job<IQueueJobPayload, IMailProcessorResult> | undefined,
        error: Error,
      ) => {
        if (job) {
          const maxAttempts = job.data.options?.attempts ?? 3;
          this.logger
            .for('onWorkerDataFail')
            .error(
              'Job failed | Worker: %s | jobId: %s | email: %s | attempt: %d/%d | error: %s',
              workerIdentifier,
              job.data.id,
              job.data.email,
              job.attemptsMade,
              maxAttempts,
              error.message,
            );
        } else {
          this.logger
            .for('onWorkerDataFail')
            .error(
              'Worker error (no job) | Worker: %s | error: %s',
              workerIdentifier,
              error.message,
            );
        }
      },
    });

    this.workerHelpers.push(workerHelper);

    this.logger
      .for(this.addWorker.name)
      .info(
        'Worker added | Identifier: %s | Concurrency: %d | Total workers: %d',
        workerIdentifier,
        concurrency,
        this.workerHelpers.length,
      );
  }

  async removeWorker(index: number): Promise<boolean> {
    if (index < 0 || index >= this.workerHelpers.length) {
      this.logger.for(this.removeWorker.name).warn('Invalid worker index: %d', index);
      return false;
    }

    // Dropped from the list BEFORE the close is awaited: a rejecting close must not leave a half-closed worker still counted and still handed jobs.
    const [workerHelper] = this.workerHelpers.splice(index, 1);
    await workerHelper.worker.close();

    this.logger
      .for(this.removeWorker.name)
      .info('Worker removed | Index: %d | Remaining workers: %d', index, this.workerHelpers.length);

    return true;
  }

  /** Closes every worker without stopping at the first failure, always empties the list, and returns failures instead of throwing so teardown can continue. */
  private async closeWorkers(): Promise<Error[]> {
    const workerHelpers = this.workerHelpers;
    this.workerHelpers = [];

    const results = await Promise.allSettled(
      workerHelpers.map(workerHelper => workerHelper.worker.close()),
    );

    const failures: Error[] = [];

    for (const result of results) {
      if (result.status !== 'rejected') {
        continue;
      }

      const error =
        result.reason instanceof Error
          ? result.reason
          : getError({ message: `Worker close failed | reason: ${String(result.reason)}` });

      failures.push(error);
      this.logger.for('closeWorkers').error('Failed to close worker | error: %s', error.message);
    }

    return failures;
  }

  async clearWorkers(): Promise<void> {
    const count = this.workerHelpers.length;
    await this.closeWorkers();

    this.logger.for(this.clearWorkers.name).info('All workers cleared | Count: %d', count);
  }

  /** Full teardown: workers -> queue -> Redis. Every step runs even if an earlier one failed (skipping leaks a queue client + Redis socket); failures are reported once, at the end. */
  async close(): Promise<void> {
    const failures: Error[] = [...(await this.closeWorkers())];

    if (this.queueHelper) {
      try {
        await this.queueHelper.queue.close();
      } catch (error) {
        const closeError = error instanceof Error ? error : getError({ message: String(error) });
        failures.push(closeError);
        this.logger.for(this.close.name).error('Failed to close queue | error: %s', closeError);
      }
    }

    try {
      await this.redisConnection.disconnect();
    } catch (error) {
      const disconnectError = error instanceof Error ? error : getError({ message: String(error) });
      failures.push(disconnectError);
      this.logger
        .for(this.close.name)
        .error('Failed to disconnect redis | error: %s', disconnectError);
    }

    if (failures.length > 0) {
      throw getError({
        message: `[close] Incomplete BullMQ mail executor teardown | failures: ${failures
          .map(failure => failure.message)
          .join(' | ')}`,
      });
    }

    this.logger.for(this.close.name).info('BullMQ mail executor closed | Mode: %s', this.mode);
  }

  getWorkerCount(): number {
    return this.workerHelpers.length;
  }

  getMode(): TConstValue<typeof BullMQExecutorModes> {
    return this.mode;
  }

  async enqueueVerificationEmail(
    email: string,
    options?: IMailQueueOptions,
  ): Promise<IMailQueueResult> {
    if (this.mode === BullMQExecutorModes.WORKER_ONLY) {
      throw getError({
        message: 'Cannot enqueue jobs in worker-only mode. Set mode to "queue-only" or "both".',
      });
    }

    if (!this.queueHelper) {
      throw getError({
        message: 'Queue helper not initialized. This should not happen in queue-enabled mode.',
      });
    }

    if (!this.processor && this.mode !== BullMQExecutorModes.QUEUE_ONLY) {
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
      .info(
        'Queuing email to BullMQ/Redis | jobId: %s | email: %s | mode: %s',
        jobId,
        email,
        this.mode,
      );

    const bullJob = await this.queueHelper.queue.add('send-verification-email', job, {
      priority: options?.priority,
      delay: options?.delay,
      attempts: options?.attempts ?? 3,
      backoff: {
        type: options?.backoff?.type ?? 'exponential',
        delay: options?.backoff?.delay ?? 1000,
      },
      removeOnComplete: true,
      removeOnFail: false,
    });

    return {
      jobId: bullJob.id ?? jobId,
      queued: true,
      message: 'Email queued successfully (BullMQ/Redis)',
    };
  }
}
