import { type TValueOrPromise } from '@/common/types';
import { BaseHelper } from '@/modules/base';
import { type Worker, type WorkerOptions } from 'node:worker_threads';
import { type IWorker } from '../common';

/** Base for a helper that owns a `Worker` and reacts to its lifecycle events. */
export abstract class AbstractWorkerHelper<MessageType>
  extends BaseHelper
  implements IWorker<MessageType>
{
  worker: Worker;
  options: WorkerOptions;

  abstract onOnline(): TValueOrPromise<void>;
  abstract onExit(opts: { code: string | number }): TValueOrPromise<void>;
  abstract onError(opts: { error: Error }): TValueOrPromise<void>;
  abstract onMessage(opts: { message: MessageType }): TValueOrPromise<void>;
  abstract onMessageError(opts: { error: Error }): TValueOrPromise<void>;
}
