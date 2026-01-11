import { BaseHelper } from '@/helpers/base';
import { DefaultRedisHelper } from '@/helpers/redis';
import { Job, Queue, Worker } from 'bullmq';
import { TBullQueueRole } from '../common';

/**
 * BullMQ Helper for queue and worker management.
 *
 * @example
 * // When using Redis Cluster, initialize with recommended options:
 * import { Cluster } from 'ioredis';
 *
 * const cluster = new Cluster(
 *   [
 *     { host: 'node1.redis.example.com', port: 6379 },
 *     { host: 'node2.redis.example.com', port: 6379 },
 *     { host: 'node3.redis.example.com', port: 6379 },
 *   ],
 *   {
 *     // Recommended options for BullMQ:
 *     maxRetriesPerRequest: null,      // Required by BullMQ (disables retry limit)
 *     enableReadyCheck: true,          // Wait until cluster is ready
 *     scaleReads: 'slave',             // Optional: read from replicas to reduce master load
 *
 *     // If behind NAT/proxy:
 *     // natMap: {
 *     //   'internal-ip:6379': { host: 'external-ip', port: 6379 }
 *     // },
 *
 *     redisOptions: {
 *       password: 'your-password',     // If auth required
 *       tls: {},                       // If TLS required
 *     },
 *   }
 * );
 *
 * const redisHelper = new DefaultRedisHelper({
 *   scope: 'BullMQ',
 *   identifier: 'my-redis',
 *   client: cluster,
 * });
 *
 * const helper = BullMQHelper.newInstance({
 *   queueName: 'my-queue',
 *   identifier: 'my-worker',
 *   role: 'worker',
 *   redisConnection: redisHelper,
 *   onWorkerData: async (job) => { ... },
 * });
 *
 * @note `maxRetriesPerRequest: null` is required by BullMQ for both Redis and Cluster connections to prevent blocking issues.
 */
interface IBullMQOptions<TQueueElement = any, TQueueResult = any> {
  queueName: string;
  identifier: string;
  role: TBullQueueRole;
  redisConnection: DefaultRedisHelper;

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
  protected redisConnection: DefaultRedisHelper;

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

  configureQueue() {
    if (!this.queueName) {
      this.logger
        .for(this.configureQueue.name)
        .error('Invalid queue name | ID: %s', this.identifier);
      return;
    }

    this.queue = new Queue<TQueueElement, TQueueResult>(this.queueName, {
      connection: this.redisConnection.getClient().duplicate(),
      defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: true,
      },
    });
  }

  configureWorker() {
    if (!this.queueName) {
      this.logger
        .for(this.configureWorker.name)
        .error('Invalid worker name | ID: %s', this.identifier);
      return;
    }

    this.worker = new Worker<TQueueElement, TQueueResult>(
      this.queueName,
      async job => {
        if (this.onWorkerData) {
          const rs = await this.onWorkerData(job);
          return rs;
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
      },
      {
        connection: this.redisConnection.getClient().duplicate(),
        concurrency: this.numberOfWorker,
        lockDuration: this.lockDuration,
      },
    );

    this.worker.on('completed', (job, result) => {
      this.onWorkerDataCompleted?.(job, result)
        .then(() => {
          // Do something after processing completed job
        })
        .catch(error => {
          this.logger
            .for('worker-completed')
            .error(
              'queue: %s | Error while processing completed job! Error: %s | ID: %s',
              this.queueName,
              error,
              this.identifier,
            );
        });
    });

    this.worker.on('failed', (job, reason) => {
      this.onWorkerDataFail?.(job, reason)
        .then(() => {
          // Do something after processing failed job
        })
        .catch(error => {
          this.logger
            .for('worker-failed')
            .error(
              'queue: %s | Error while processing completed job! Error: %s | ID: %s',
              this.queueName,
              error,
              this.identifier,
            );
        });
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
    try {
      await this.worker?.close();
      await this.queue?.close();
      this.logger
        .for(this.close.name)
        .info('BullMQ helper closed successfully | ID: %s', this.identifier);
    } catch (error) {
      this.logger
        .for(this.close.name)
        .error('Error closing BullMQ helper: %s | ID: %s', error, this.identifier);
      throw error;
    }
  }
}
