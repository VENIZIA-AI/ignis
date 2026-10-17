import { type ValueOrPromise } from '@/common/types';
import { BaseHelper } from '@/modules/base';
import { type Worker, type WorkerOptions } from 'node:worker_threads';
import { type IWorker } from '../common';

export abstract class AbstractWorkerHelper<MessageType>
  extends BaseHelper
  implements IWorker<MessageType>
{
  worker: Worker;
  options: WorkerOptions;

  abstract onOnline(): ValueOrPromise<void>;
  abstract onExit(opts: { code: string | number }): ValueOrPromise<void>;
  abstract onError(opts: { error: Error }): ValueOrPromise<void>;
  abstract onMessage(opts: { message: MessageType }): ValueOrPromise<void>;
  abstract onMessageError(opts: { error: Error }): ValueOrPromise<void>;
}
