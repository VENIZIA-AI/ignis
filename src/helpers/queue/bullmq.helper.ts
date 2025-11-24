import { BaseHelper } from '@/base/helpers';
import { Job, Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import { TBullQueueRole } from './types';

interface IBullMQOptions<TQueueElement = any, TQueueResult = any> {
  queueName: string;
  identifier: string;
  role: TBullQueueRole;
  connection: Redis;

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
  private queueName: string;
  private role: TBullQueueRole;
  private connection: Redis;

  queue: Queue<TQueueElement, TQueueResult>;
  worker: Worker<TQueueElement, TQueueResult>;

  private numberOfWorker = 1;
  private lockDuration = 90 * 60 * 1000;

  private onWorkerData?: (job: Job<TQueueElement, TQueueResult>) => Promise<any>;
  private onWorkerDataCompleted?: (
    job: Job<TQueueElement, TQueueResult>,
    result: any,
  ) => Promise<void>;
  private onWorkerDataFail?: (
    job: Job<TQueueElement, TQueueResult> | undefined,
    error: Error,
  ) => Promise<void>;

  constructor(options: IBullMQOptions<TQueueElement, TQueueResult>) {
    super({ scope: BullMQHelper.name, identifier: options.identifier });
    const {
      queueName,
      connection,
      role,
      numberOfWorker = 1,
      lockDuration = 90 * 60 * 1000,
      onWorkerData,
      onWorkerDataCompleted,
      onWorkerDataFail,
    } = options;

    this.queueName = queueName;
    this.role = role;
    this.connection = connection;

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
      this.logger.error('[configureQueue][%s] Invalid queue name', this.identifier);
      return;
    }

    this.queue = new Queue<TQueueElement, TQueueResult>(this.queueName, {
      connection: this.connection,
      defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: true,
      },
    });
  }

  configureWorker() {
    if (!this.queueName) {
      this.logger.error('[configureWorkers][%s] Invalid worker name', this.identifier);
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
        this.logger.info(
          '[onWorkerData][%s] queue: %s | id: %s | name: %s | data: %j',
          this.identifier,
          this.queueName,
          id,
          name,
          data,
        );
      },
      {
        connection: this.connection,
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
          this.logger.error(
            '[Worker][%s][completed] queue: %s | Error while processing completed job! Error: %s',
            this.identifier,
            this.queueName,
            error,
          );
        });
    });

    this.worker.on('failed', (job, reason) => {
      this.onWorkerDataFail?.(job, reason)
        .then(() => {
          // Do something after processing failed job
        })
        .catch(error => {
          this.logger.error(
            '[Worker][%s][failed] queue: %s | Error while processing completed job! Error: %s',
            this.identifier,
            this.queueName,
            error,
          );
        });
    });
  }

  configure() {
    if (!this.role) {
      this.logger.error(
        '[configure][%s] Invalid client role to configure | Valid roles: [queue|worker]',
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
}
