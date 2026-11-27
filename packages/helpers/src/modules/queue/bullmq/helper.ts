import type { ValueOrPromise } from '@/common';
import { BaseHelper } from '@/modules/base';
import { getError } from '@/modules/error';
import { type IRedisHelper, RedisDefaults, type TRedisClient } from '@/modules/redis';
import { ErrorUtility } from '@/utilities/error.utility';
import { ModuleUtility } from '@/utilities/module.utility';
import type {
  Job,
  JobsOptions,
  Processor,
  Queue,
  QueueOptions,
  Worker,
  WorkerOptions,
} from 'bullmq';
import { BullMQDefaults, BullQueueRoles, HookUtility, type TBullQueueRole } from '../common';

/** The key BullMQ stores in a job's `opts` for the metadata block: not the payload, so `job.data` is what the producer added. */
const METADATA_OPTION = 'metadata';

/** `Queue.add` for this helper's element and result types: BullMQ resolves its name and data types through conditional types, so they are read off the method. */
type TQueueAdd<TElement, TResult> = Queue<TElement, TResult>['add'];

/** What `onWorkerData` is told beside the job: the metadata the producer's helper stamped, `undefined` for a job added without one. */
export interface IBullMQJobContext<TMetadata extends object = Record<string, unknown>> {
  metadata: TMetadata | undefined;
}

/** Options for {@link BullMQHelper}. `role` decides whether a `Queue` or a `Worker` is built. */
export interface IBullMQOptions<
  TQueueElement = unknown,
  TQueueResult = unknown,
  TMetadata extends object = Record<string, unknown>,
> {
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

  /**
   * The prefix of every Redis key of the queue, on the Queue AND the Worker so they cannot disagree. Opt-in: unset is BullMQ's own
   * `bull`, so no key moves. A `queueOptions.prefix` or `workerOptions.prefix` that differs is refused. Switching it strands the
   * waiting, failed and repeatable jobs and the job schedulers under the old prefix: see the queue helper's migration notes.
   */
  prefix?: string;

  /**
   * A block stamped on every job added through `add`, run on each add and stored in the job's `opts.metadata`, outside `job.data`.
   * A throw fails the add; the answer must be a plain object. The worker reads it as `context.metadata`.
   */
  metadata?: () => ValueOrPromise<TMetadata>;

  /** Merged over the framework defaults, under the fields the helper owns (`connection`) - see `queueOptionsFor`. */
  queueOptions?: Omit<QueueOptions, 'connection'>;
  /** Merged under the fields the helper owns (`connection`, `concurrency`, `lockDuration`) - see `workerOptionsFor`. */
  workerOptions?: Omit<WorkerOptions, 'connection' | 'concurrency' | 'lockDuration'>;

  onWorkerData?: (
    job: Job<TQueueElement, TQueueResult>,
    context: IBullMQJobContext<TMetadata>,
  ) => Promise<TQueueResult>;
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
export class BullMQHelper<
  TQueueElement = unknown,
  TQueueResult = unknown,
  TMetadata extends object = Record<string, unknown>,
> extends BaseHelper {
  protected queueName: string;
  protected role: TBullQueueRole;
  protected redisConnection: IRedisHelper;

  queue: Queue<TQueueElement, TQueueResult>;
  worker: Worker<TQueueElement, TQueueResult>;

  protected numberOfWorker: number;
  protected lockDuration: number;

  protected queueOptions?: Omit<QueueOptions, 'connection'>;
  protected workerOptions?: Omit<WorkerOptions, 'connection' | 'concurrency' | 'lockDuration'>;

  protected prefix?: string;
  protected metadata?: () => ValueOrPromise<TMetadata>;

  protected onWorkerData?: (
    job: Job<TQueueElement, TQueueResult>,
    context: IBullMQJobContext<TMetadata>,
  ) => Promise<TQueueResult>;

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

  constructor(options: IBullMQOptions<TQueueElement, TQueueResult, TMetadata>) {
    super({ scope: BullMQHelper.name, identifier: options.identifier });
    const {
      queueName,
      redisConnection,
      role,
      numberOfWorker = BullMQDefaults.NUMBER_OF_WORKER,
      lockDuration = BullMQDefaults.LOCK_DURATION_MS,
      prefix,
      metadata,
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

    this.prefix = BullMQHelper.resolvePrefix({
      identifier: this.identifier,
      prefix,
      queueOptions,
      workerOptions,
    });
    this.metadata = metadata;

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

  static newInstance<T = unknown, R = unknown, M extends object = Record<string, unknown>>(
    opts: IBullMQOptions<T, R, M>,
  ) {
    return new BullMQHelper<T, R, M>(opts);
  }

  /** `prefix` as the helper keeps it: a non-empty string with no whitespace and no brace (a brace would move the cluster hash tag), the same on the Queue and the Worker; unset stays unset (BullMQ's `bull`). */
  private static resolvePrefix(opts: {
    identifier: string;
    prefix?: string;
    queueOptions?: Omit<QueueOptions, 'connection'>;
    workerOptions?: Omit<WorkerOptions, 'connection' | 'concurrency' | 'lockDuration'>;
  }): string | undefined {
    const { identifier, prefix, queueOptions, workerOptions } = opts;

    if (prefix === undefined) {
      return undefined;
    }

    if (typeof prefix !== 'string' || prefix.length === 0 || /[\s{}]/.test(prefix)) {
      throw getError({
        message: `[BullMQHelper][${identifier}] Invalid prefix | value: ${JSON.stringify(prefix)} | it must be a non-empty string without whitespace or braces`,
      });
    }

    for (const [name, other] of [
      ['queueOptions.prefix', queueOptions?.prefix],
      ['workerOptions.prefix', workerOptions?.prefix],
    ]) {
      if (other !== undefined && other !== prefix) {
        throw getError({
          message: `[BullMQHelper][${identifier}] ${name} (${other}) differs from prefix (${prefix}) | the helper owns the prefix of its Queue and Worker: set it once`,
        });
      }
    }

    return prefix;
  }

  /** The metadata a producer's helper stamped on `job`, or `undefined` for a job added without one (a raw `queue.add`, another producer). Not part of `job.data`. Returned as stored: its fields are not validated against `TMetadata`. */
  static readMetadata<TMetadata extends object = Record<string, unknown>>(opts: {
    job: Pick<Job, 'opts'> | undefined;
  }): TMetadata | undefined {
    const value = Reflect.get(Object(opts.job?.opts), METADATA_OPTION);

    return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : undefined;
  }

  /**
   * Adds a job, stamped by the `metadata` option: the stamp goes to `opts.metadata`, and `data` is exactly what you pass (any shape). A direct
   * `queue.add` is available and unstamped. Refuses `opts.metadata` from the caller (the stamp is the one source) and a stamp that is not an object.
   */
  async add(opts: {
    name: Parameters<TQueueAdd<TQueueElement, TQueueResult>>[0];
    data: Parameters<TQueueAdd<TQueueElement, TQueueResult>>[1];
    opts?: JobsOptions;
  }): ReturnType<TQueueAdd<TQueueElement, TQueueResult>> {
    if (!this.queue) {
      throw getError({
        message: `[BullMQHelper][${this.identifier}] add needs a helper with role 'queue' | role: ${this.role}`,
      });
    }

    if (opts.opts !== undefined && Reflect.has(opts.opts, METADATA_OPTION)) {
      throw getError({
        message: `[BullMQHelper][${this.identifier}] opts.metadata is stamped by the helper's metadata option | it is not set per call`,
      });
    }

    const stamp = await this.metadata?.();

    if (stamp === undefined) {
      return this.queue.add(opts.name, opts.data, opts.opts);
    }

    if (stamp === null || typeof stamp !== 'object' || Array.isArray(stamp)) {
      throw getError({
        message: `[BullMQHelper][${this.identifier}] The metadata option must answer a plain object | got: ${Array.isArray(stamp) ? 'an array' : typeof stamp}`,
      });
    }

    // BullMQ keeps an option key it does not know, and hands it back on `job.opts`; its type is closed, so the key is added by assignment.
    return this.queue.add(
      opts.name,
      opts.data,
      Object.assign({}, opts.opts, { [METADATA_OPTION]: stamp }),
    );
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
      ...this.queueOptions,
      // Merged key by key: a project's `{ attempts, backoff }` must not drop the clean-up defaults and let jobs pile up in Redis.
      defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: true,
        ...this.queueOptions?.defaultJobOptions,
      },
      ...(this.prefix === undefined ? {} : { prefix: this.prefix }),
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
      ...(this.prefix === undefined ? {} : { prefix: this.prefix }),
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
          return this.onWorkerData(job, {
            metadata: BullMQHelper.readMetadata<TMetadata>({ job }),
          });
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

        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- a worker with no `onWorkerData` answers nothing, whatever result type the queue declares
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
      default: {
        // `isValid` above refused every other role.
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
