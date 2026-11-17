import { BaseHelper } from '@/modules/base';
import { getError } from '@/modules/error';
import { type IRedisHelper, RedisDefaults, type TRedisClient } from '@/modules/redis';
import { ErrorUtility } from '@/utilities/error.utility';
import { ModuleUtility } from '@/utilities/module.utility';
import type { Job, Processor, Queue, QueueOptions, Worker, WorkerOptions } from 'bullmq';
import { BullMQDefaults, BullQueueRoles, HookUtility, type TBullQueueRole } from '../common';

/** Options for {@link BullMQHelper}. `role` decides whether a `Queue` or a `Worker` is built. */
export interface IBullMQOptions<TQueueElement = unknown, TQueueResult = unknown> {
  queueName: string;
  identifier: string;
  role: TBullQueueRole;
  redisConnection: IRedisHelper;

  /** `bullmq` itself, for a `bun build --compile` binary that has no `node_modules` to load it from. Omitted, it is loaded when a queue or worker is built. */
  module?: typeof import('bullmq');

  /**
   * Worker concurrency.
   * @default BullMQDefaults.NUMBER_OF_WORKER
   */
  numberOfWorker?: number;
  /**
   * How long a worker holds a job's lock, in milliseconds.
   * @default BullMQDefaults.LOCK_DURATION_MS
   */
  lockDuration?: number;

  /** Merged over the framework defaults, under the fields the helper owns (`connection`) - see `queueOptionsFor`. */
  queueOptions?: Omit<QueueOptions, 'connection'>;
  /** Merged under the fields the helper owns (`connection`, `concurrency`, `lockDuration`) - see `workerOptionsFor`. */
  workerOptions?: Omit<WorkerOptions, 'connection' | 'concurrency' | 'lockDuration'>;

  onWorkerData?: (job: Job<TQueueElement, TQueueResult>) => Promise<TQueueResult>;
  onWorkerDataCompleted?: (
    job: Job<TQueueElement, TQueueResult>,
    result: TQueueResult,
  ) => Promise<void>;
  onWorkerDataFail?: (
    job: Job<TQueueElement, TQueueResult> | undefined,
    error: Error,
  ) => Promise<void>;
}

/**
 * Wraps a BullMQ `Queue` or `Worker` (per `role`) on one Redis connection.
 * Worker concurrency is `numberOfWorker`; `lockDuration` is in milliseconds.
 */
export class BullMQHelper<TQueueElement = unknown, TQueueResult = unknown> extends BaseHelper {
  protected queueName: string;
  protected role: TBullQueueRole;
  protected redisConnection: IRedisHelper;

  queue: Queue<TQueueElement, TQueueResult>;
  worker: Worker<TQueueElement, TQueueResult>;

  protected numberOfWorker: number;
  protected lockDuration: number;

  protected queueOptions?: Omit<QueueOptions, 'connection'>;
  protected workerOptions?: Omit<WorkerOptions, 'connection' | 'concurrency' | 'lockDuration'>;

  protected onWorkerData?: (job: Job<TQueueElement, TQueueResult>) => Promise<TQueueResult>;
  protected onWorkerDataCompleted?: (
    job: Job<TQueueElement, TQueueResult>,
    result: TQueueResult,
  ) => Promise<void>;

  protected onWorkerDataFail?: (
    job: Job<TQueueElement, TQueueResult> | undefined,
    error: Error,
  ) => Promise<void>;

  private readonly bullmqModule?: typeof import('bullmq');
  private isClosing = false;
  /** Every duplicate this helper handed to BullMQ: BullMQ never quits a client it is given, so `close()` does. */
  private readonly duplicates: TRedisClient[] = [];

  constructor(options: IBullMQOptions<TQueueElement, TQueueResult>) {
    super({ scope: BullMQHelper.name, identifier: options.identifier });
    const {
      queueName,
      redisConnection,
      role,
      numberOfWorker = BullMQDefaults.NUMBER_OF_WORKER,
      lockDuration = BullMQDefaults.LOCK_DURATION_MS,
      queueOptions,
      workerOptions,
      onWorkerData,
      onWorkerDataCompleted,
      onWorkerDataFail,
      module,
    } = options;

    this.bullmqModule = module;

    this.queueName = queueName;
    this.role = role;
    this.redisConnection = redisConnection;

    this.numberOfWorker = numberOfWorker;
    this.lockDuration = lockDuration;

    this.queueOptions = queueOptions;
    this.workerOptions = workerOptions;

    this.onWorkerData = onWorkerData;
    this.onWorkerDataCompleted = onWorkerDataCompleted;
    this.onWorkerDataFail = onWorkerDataFail;

    this.configure();
  }

  /** BullMQ never reconnects a client: once ioredis stops reconnecting (`maxRetry` attempts used up) it is `end` for good, no job moves, and nothing else says so. */
  protected reportClientEnded() {
    this.logger
      .for(this.reportClientEnded.name)
      .error(
        'The Redis client ended, so BullMQ can no longer move jobs on queue %s | ioredis stopped reconnecting after maxRetry attempts | Back BullMQ with a helper whose maxRetry is %d (forever) | ID: %s',
        this.queueName,
        RedisDefaults.RETRY_FOREVER,
        this.identifier,
      );
  }

  static newInstance<T = unknown, R = unknown>(opts: IBullMQOptions<T, R>) {
    return new BullMQHelper<T, R>(opts);
  }

  /** Structural, never `instanceof`: ioredis is an optional peer, and a second copy fails `instanceof` anyway. */
  protected isClusterClient(): boolean {
    const client = Object(this.redisConnection.getClient());

    if (Reflect.get(client, 'isCluster') === true) {
      return true;
    }

    return typeof Reflect.get(client, 'nodes') === 'function';
  }

  protected resolveQueueName(): string {
    if (this.isClusterClient() && !this.queueName.startsWith('{')) {
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

    // An 'error' event without a listener is re-thrown by EventEmitter - a Redis hiccup would take the whole process down.
    this.queue.on('error', (error) => {
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

  /** Full `Queue` options: framework defaults, then `this.queueOptions`, then the connection the helper owns - in that precedence order. */
  protected queueOptionsFor(opts: { queueName: string }): QueueOptions {
    this.logger
      .for(this.queueOptionsFor.name)
      .debug('Building queue options | Queue: %s | ID: %s', opts.queueName, this.identifier);

    return {
      defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: true,
      },
      ...this.queueOptions,
      connection: this.createConnection(),
    };
  }

  /**
   * The connection BullMQ owns: a duplicate of the helper's client, so the queue or worker connects it by itself
   * whatever state the shared client is in. BullMQ treats a client it is handed as shared and never quits it, so the
   * helper keeps the duplicate and quits it in `close()`.
   */
  protected createConnection(): TRedisClient {
    const connection = this.redisConnection.duplicateClient();
    this.duplicates.push(connection);
    connection.once('end', () => {
      if (!this.isClosing) {
        this.reportClientEnded();
      }
    });

    return connection;
  }

  /** Full `Worker` options: `this.workerOptions`, then the connection/concurrency/lock fields the helper owns - in that precedence order. */
  protected workerOptionsFor(opts: {
    queueName: string;
    processor: Processor<TQueueElement, TQueueResult>;
  }): WorkerOptions {
    this.logger
      .for(this.workerOptionsFor.name)
      .debug('Building worker options | Queue: %s | ID: %s', opts.queueName, this.identifier);

    return {
      ...this.workerOptions,
      connection: this.createConnection(),
      concurrency: this.numberOfWorker,
      lockDuration: this.lockDuration,
    };
  }

  /** `bullmq` is an optional peer: loaded when a queue or worker is built, not when this module is. */
  private loadBullMQ(): typeof import('bullmq') {
    return (
      this.bullmqModule ?? ModuleUtility.loadSync<typeof import('bullmq')>({ module: 'bullmq' })
    );
  }

  /** Client factory seam - overridden in tests to run the helper without Redis. */
  protected buildQueue(opts: { queueName: string }): Queue<TQueueElement, TQueueResult> {
    const bullmq = this.loadBullMQ();

    return new bullmq.Queue<TQueueElement, TQueueResult>(
      opts.queueName,
      this.queueOptionsFor(opts),
    );
  }

  /** Client factory seam - overridden in tests to run the helper without Redis. */
  protected buildWorker(opts: {
    queueName: string;
    processor: Processor<TQueueElement, TQueueResult>;
  }): Worker<TQueueElement, TQueueResult> {
    const bullmq = this.loadBullMQ();

    return new bullmq.Worker<TQueueElement, TQueueResult>(
      opts.queueName,
      opts.processor,
      this.workerOptionsFor(opts),
    );
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
      processor: async (job) => {
        if (this.onWorkerData) {
          return this.onWorkerData(job);
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
      HookUtility.invoke({
        logger: this.logger,
        scope: 'worker-completed',
        execution: () => this.onWorkerDataCompleted?.(job, result),
      });
    });

    this.worker.on('failed', (job, reason) => {
      HookUtility.invoke({
        logger: this.logger,
        scope: 'worker-failed',
        execution: () => this.onWorkerDataFail?.(job, reason),
      });
    });

    // An 'error' event without a listener is re-thrown by EventEmitter - a Redis hiccup would take the whole process down.
    this.worker.on('error', (error) => {
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
      case BullQueueRoles.QUEUE: {
        this.configureQueue();
        break;
      }
      case BullQueueRoles.WORKER: {
        this.configureWorker();
        break;
      }
    }
  }

  /** `quit()` waits for the replies in flight; a client BullMQ already closed is left alone. */
  private static async release(opts: { connection: TRedisClient }) {
    const { connection } = opts;

    if (connection.status === 'end') {
      return;
    }

    try {
      await connection.quit();
    } catch {
      connection.disconnect();
    }
  }

  async close() {
    this.isClosing = true;
    const failures: string[] = [];

    // Both connections must be released even when the first close fails - otherwise a failing worker close silently leaks the queue's Redis connection forever.
    try {
      await this.worker?.close();
    } catch (error) {
      this.logger
        .for(this.close.name)
        .error('Error closing BullMQ worker: %s | ID: %s', error, this.identifier);
      failures.push(ErrorUtility.toError({ error }).message);
    }

    try {
      await this.queue?.close();
    } catch (error) {
      this.logger
        .for(this.close.name)
        .error('Error closing BullMQ queue: %s | ID: %s', error, this.identifier);
      failures.push(ErrorUtility.toError({ error }).message);
    }

    for (const connection of this.duplicates.splice(0)) {
      try {
        await BullMQHelper.release({ connection });
      } catch (error) {
        this.logger
          .for(this.close.name)
          .error('Error closing the BullMQ connection: %s | ID: %s', error, this.identifier);
        failures.push(ErrorUtility.toError({ error }).message);
      }
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
