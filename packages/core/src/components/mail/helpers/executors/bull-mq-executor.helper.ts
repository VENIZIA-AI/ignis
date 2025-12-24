import {
  BaseHelper,
  BullMQHelper,
  getError,
  IRedisHelperOptions,
  RedisHelper,
  TConstValue,
} from '@/helpers';
import {
  BullMQExecutorModes,
  IMailProcessorResult,
  IMailQueueExecutor,
  IMailQueueOptions,
  IMailQueueResult,
} from '../../common';
import { Job } from 'bullmq';

interface IQueueJobPayload {
  id: string;
  email: string;
  options?: IMailQueueOptions;
  attempts: number;
  scheduledAt: number;
}

export interface IBullMQMailExecutorOpts {
  redis: IRedisHelperOptions;
  queue: { identifier: string; name: string };
  mode: TConstValue<typeof BullMQExecutorModes>;
}

export class BullMQMailExecutorHelper extends BaseHelper implements IMailQueueExecutor {
  private queueIdentifier: string;
  private queueName: string;
  private mode: TConstValue<typeof BullMQExecutorModes>;

  private queueHelper?: BullMQHelper<IQueueJobPayload, IMailQueueResult>;
  private workerHelpers: BullMQHelper<IQueueJobPayload, IMailProcessorResult>[] = [];
  private redisConnection: RedisHelper;
  private jobIdCounter = 0;

  private processor?: (email: string) => Promise<IMailProcessorResult>;

  constructor(opts: IBullMQMailExecutorOpts) {
    super({ scope: BullMQMailExecutorHelper.name });

    this.mode = opts.mode;

    this.redisConnection = new RedisHelper({
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
          connection: this.redisConnection.getClient(),
          role: 'queue',
        });

        this.logger.info(
          '[constructor] BullMQ queue executor initialized (queue enabled) | Identifier: %s | Mode: %s',
          this.queueIdentifier,
          this.mode,
        );
        break;
      }
      default: {
        this.logger.info(
          '[constructor] BullMQ queue executor initialized (worker-only mode) | Identifier: %s | Mode: %s',
          this.queueIdentifier,
          this.mode,
        );

        break;
      }
    }
  }

  async setProcessor(
    processor: (email: string) => Promise<{
      success: boolean;
      message: string;
      expiresInMinutes: number;
      nextResendAt?: string;
    }>,
    opts?: {
      numberOfWorkers?: number;
      concurrencyPerWorker?: number;
      lockDuration?: number;
    },
  ): Promise<void> {
    this.processor = processor;

    if (this.mode === BullMQExecutorModes.QUEUE_ONLY) {
      this.logger.warn(
        '[setProcessor] Skipping worker creation in queue-only mode. Workers will not be started.',
      );
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

    this.logger.info(
      '[setProcessor] Processor registered | Mode: %s | Workers: %d | Concurrency per worker: %d',
      this.mode,
      numberOfWorkers,
      concurrencyPerWorker,
    );
  }

  addWorker(opts: { workerIdentifier: string; concurrency?: number; lockDuration?: number }): void {
    if (!this.processor) {
      throw getError({ message: 'Processor not set. Call setProcessor() first.' });
    }

    const workerIdentifier = opts.workerIdentifier;
    const concurrency = opts?.concurrency ?? 5;
    const lockDuration = opts?.lockDuration ?? 30000;

    const workerHelper = new BullMQHelper<IQueueJobPayload, IMailProcessorResult>({
      identifier: workerIdentifier,
      queueName: this.queueName,
      connection: this.redisConnection.getClient(),
      role: 'worker',
      numberOfWorker: concurrency,
      lockDuration,
      onWorkerData: async (job: Job<IQueueJobPayload, IMailProcessorResult>) => {
        const maxAttempts = job.data.options?.attempts ?? 3;

        this.logger.info(
          '[onWorkerData] Processing job | Worker: %s | jobId: %s | email: %s | attempt: %d/%d',
          workerIdentifier,
          job.data.id,
          job.data.email,
          job.attemptsMade + 1,
          maxAttempts,
        );

        return this.processor?.(job.data.email);
      },
      onWorkerDataCompleted: async (job: Job<IQueueJobPayload, IMailProcessorResult>) => {
        this.logger.info(
          '[onWorkerDataCompleted] Job completed | Worker: %s | jobId: %s | email: %s',
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
          this.logger.error(
            '[onWorkerDataFail] Job failed | Worker: %s | jobId: %s | email: %s | attempt: %d/%d | error: %s',
            workerIdentifier,
            job.data.id,
            job.data.email,
            job.attemptsMade,
            maxAttempts,
            error.message,
          );
        } else {
          this.logger.error(
            '[onWorkerDataFail] Worker error (no job) | Worker: %s | error: %s',
            workerIdentifier,
            error.message,
          );
        }
      },
    });

    this.workerHelpers.push(workerHelper);

    this.logger.info(
      '[addWorker] Worker added | Identifier: %s | Concurrency: %d | Total workers: %d',
      workerIdentifier,
      concurrency,
      this.workerHelpers.length,
    );
  }

  async removeWorker(index: number): Promise<boolean> {
    if (index < 0 || index >= this.workerHelpers.length) {
      this.logger.warn('[removeWorker] Invalid worker index: %d', index);
      return false;
    }

    await this.workerHelpers[index].worker.close();
    this.workerHelpers.splice(index, 1);

    this.logger.info(
      '[removeWorker] Worker removed | Index: %d | Remaining workers: %d',
      index,
      this.workerHelpers.length,
    );

    return true;
  }

  async clearWorkers(): Promise<void> {
    const count = this.workerHelpers.length;
    await Promise.all(this.workerHelpers.map(workerHelper => workerHelper.worker.close()));

    this.workerHelpers = [];

    this.logger.info('[clearWorkers] All workers cleared | Count: %d', count);
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
      '[enqueueVerificationEmail] Queuing email to BullMQ/Redis | jobId: %s | email: %s | mode: %s',
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
