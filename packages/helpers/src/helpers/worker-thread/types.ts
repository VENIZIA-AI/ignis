import { AnyType, ValueOrPromise } from '@/common/types';
import { MessagePort, Transferable, Worker, WorkerOptions } from 'node:worker_threads';

// -------------------------------------------------------------------------------------------
export interface IWorker<MessageType> {
  worker: Worker;
  options: WorkerOptions;

  onOnline(): ValueOrPromise<void>;
  onExit(opts: { code: string | number }): ValueOrPromise<void>;
  onError(opts: { error: Error }): ValueOrPromise<void>;
  onMessage(opts: { message: MessageType }): ValueOrPromise<void>;
  onMessageError(opts: { error: Error }): ValueOrPromise<void>;
}

// -------------------------------------------------------------------------------------------
export interface IWorkerThread {
  buses: {
    [workerKey: string | symbol]: IWorkerBus<AnyType, AnyType>;
  };
}

export interface IWorkerMessageBusHandler<IConsumePayload> {
  onMessage: (opts: { message: IConsumePayload }) => ValueOrPromise<void>;

  onClose: () => ValueOrPromise<void>;
  onError: (opts: { error: Error }) => ValueOrPromise<void>;
  onExit: (opts: { exitCode: number | string }) => ValueOrPromise<void>;
}

export interface IWorkerBus<IConsumePayload, IPublishPayload> {
  port: MessagePort;
  handler: IWorkerMessageBusHandler<IConsumePayload>;

  onBeforePostMessage?(opts: { message: IPublishPayload }): ValueOrPromise<void>;
  onAfterPostMessage?(opts: { message: IPublishPayload }): ValueOrPromise<void>;
  postMessage(opts: {
    message: IPublishPayload;
    transferList: readonly Transferable[] | undefined;
  }): ValueOrPromise<void>;
}
