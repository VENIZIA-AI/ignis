import { BaseHelper } from '@/modules/base';
import { getError } from '@/modules/error';
import { IRedisHelper } from '@/modules/redis';
import { toError } from '@/utilities/promise.utility';
import { ConnectionOptions, Job, Processor, Queue, Worker } from 'bullmq';
import { Cluster } from 'ioredis';
import { invokeHook, TBullQueueRole } from '../common';

interface IBullMQOptions<TQueueElement = any, TQueueResult = any> {
  queueName: string;
  identifier: string;
  role: TBullQueueRole;
  redisConnection: IRedisHelper;

  numberOfWorker?: number;
  lockDuration?: number;

  onWorkerData?: (job: Job<TQueueElement, TQueueResult>) => Promise<any>;
  onWorkerDataCompleted?: (job: Job<TQueueElement, TQueueResult>, result: any) => Promise<void>;
  onWorkerDataFail?: (
    job: Job<TQueueElement, TQueueResult> | undefined,
    error: Error,
  ) => Promise<void>;
}

export class BullMQHelper<TQueueElement = any, TQueueResult = any> extends BaseHelper {
  protected queueName: string;
  protected role: TBullQueueRole;
  protected redisConnection: IRedisHelper;

  queue: Queue<TQueueElement, TQueueResult>;
  worker: Worker<TQueueElement, TQueueResult>;

  protected numberOfWorker = 1;
  protected lockDuration = 90 * 60 * 1000;

  protected onWorkerData?: (job: Job<TQueueElement, TQueueResult>) => Promise<any>;
  protected onWorkerDataCompleted?: (
    job: Job<TQueueElement, TQueueResult>,
    result: any,
  ) => Promise<void>;
  protected onWorkerDataFail?: (
    job: Job<TQueueElement, TQueueResult> | undefined,
    error: Error,
  ) => Promise<void>;

  constructor(options: IBullMQOptions<TQueueElement, TQueueResult>) {
    super({ scope: BullMQHelper.name, identifier: options.identifier });
    const {
      queueName,
      redisConnection,
      role,
      numberOfWorker = 1,
      lockDuration = 90 * 60 * 1000,
      onWorkerData,
      onWorkerDataCompleted,
      onWorkerDataFail,
    } = options;

    this.queueName = queueName;
    this.role = role;
    this.redisConnection = redisConnection;

    this.numberOfWorker = numberOfWorker;
    this.lockDuration = lockDuration;

    this.onWorkerData = onWorkerData;
    this.onWorkerDataCompleted = onWorkerDataCompleted;
    this.onWorkerDataFail = onWorkerDataFail;

    this.configure();
  }

  static newInstance<T = any, R = any>(opts: IBullMQOptions<T, R>) {
    return new BullMQHelper<T, R>(opts);
  }

  private resolveQueueName(): string {
    const isCluster = this.redisConnection.getClient() instanceof Cluster;
    if (isCluster && !this.queueName.startsWith('{')) {
      return `{${this.queueName}}`;
    }

    return this.queueName;
  }

  configureQueue() {
    if (!this.queueName) {
      this.logger
        .for(this.configureQueue.name)
        .error('Invalid queue name | ID: %s', this.identifier);
      return;
    }

    const queueName = this.resolveQueueName();
    this.queue = this.buildQueue({ queueName });

    // An 'error' event without a listener is re-thrown by EventEmitter - a Redis hiccup would take the
    // whole process down.
    this.queue.on('error', error => {
      this.logger
        .for('queue-error')
        .error(
          'queue: %s | Queue error! Error: %s | ID: %s',
          this.queueName,
          error,
          this.identifier,
        );
    });
  }

  /** Client factory seam - overridden in tests to run the helper without Redis. */
  protected buildQueue(opts: { queueName: string }): Queue<TQueueElement, TQueueResult> {
    return new Queue<TQueueElement, TQueueResult>(opts.queueName, {
      connection: this.redisConnection.duplicateClient() as ConnectionOptions,
      defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: true,
      },
    });
  }

  /** Client factory seam - overridden in tests to run the helper without Redis. */
  protected buildWorker(opts: {
    queueName: string;
    processor: Processor<TQueueElement, TQueueResult>;
  }): Worker<TQueueElement, TQueueResult> {
    return new Worker<TQueueElement, TQueueResult>(opts.queueName, opts.processor, {
      connection: this.redisConnection.duplicateClient() as ConnectionOptions,
      concurrency: this.numberOfWorker,
      lockDuration: this.lockDuration,
    });
  }

  configureWorker() {
    if (!this.queueName) {
      this.logger
        .for(this.configureWorker.name)
        .error('Invalid worker name | ID: %s', this.identifier);
      return;
    }

    const queueName = this.resolveQueueName();
    this.worker = this.buildWorker({
      queueName,
      processor: async job => {
        if (this.onWorkerData) {
          const result = await this.onWorkerData(job);
          return result;
        }

        const { id, name, data } = job;
        this.logger
          .for('onWorkerData')
          .info(
            'queue: %s | id: %s | name: %s | data: %j | ID: %s',
            this.queueName,
            id,
            name,
            data,
            this.identifier,
          );

        return undefined as TQueueResult;
      },
    });

    this.worker.on('completed', (job, result) => {
      invokeHook({
        logger: this.logger,
        scope: 'worker-completed',
        execution: () => this.onWorkerDataCompleted?.(job, result),
      });
    });

    this.worker.on('failed', (job, reason) => {
      invokeHook({
        logger: this.logger,
        scope: 'worker-failed',
        execution: () => this.onWorkerDataFail?.(job, reason),
      });
    });

    // An 'error' event without a listener is re-thrown by EventEmitter - a Redis hiccup would take the
    // whole process down.
    this.worker.on('error', error => {
      this.logger
        .for('worker-error')
        .error(
          'queue: %s | Worker error! Error: %s | ID: %s',
          this.queueName,
          error,
          this.identifier,
        );
    });
  }

  configure() {
    if (!this.role) {
      this.logger
        .for(this.configure.name)
        .error(
          'Invalid client role to configure | Valid roles: [queue|worker] | ID: %s',
          this.identifier,
        );
      return;
    }

    switch (this.role) {
      case 'queue': {
        this.configureQueue();
        break;
      }
      case 'worker': {
        this.configureWorker();
        break;
      }
    }
  }

  async close() {
    const failures: string[] = [];

    // Both connections must be released even when the first close fails - otherwise a failing worker
    // close silently leaks the queue's Redis connection forever.
    try {
      await this.worker?.close();
    } catch (error) {
      this.logger
        .for(this.close.name)
        .error('Error closing BullMQ worker: %s | ID: %s', error, this.identifier);
      failures.push(toError(error).message);
    }

    try {
      await this.queue?.close();
    } catch (error) {
      this.logger
        .for(this.close.name)
        .error('Error closing BullMQ queue: %s | ID: %s', error, this.identifier);
      failures.push(toError(error).message);
    }

    if (failures.length) {
      throw getError({
        message: `[close][${this.identifier}] Failed to close BullMQ helper | Errors: ${failures.join(' | ')}`,
      });
    }

    this.logger
      .for(this.close.name)
      .info('BullMQ helper closed successfully | ID: %s', this.identifier);
  }
}
