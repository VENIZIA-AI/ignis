import { type AnyType, type ValueOrPromise } from '@/common/types';
import {
  type MessagePort,
  type Transferable,
  type Worker,
  type WorkerOptions,
} from 'node:worker_threads';

/** A managed `Worker` and the hooks fired for its lifecycle events. */
export interface IWorker<MessageType> {
  worker: Worker;
  options: WorkerOptions;

  onOnline(): ValueOrPromise<void>;
  onExit(opts: { code: string | number }): ValueOrPromise<void>;
  onError(opts: { error: Error }): ValueOrPromise<void>;
  onMessage(opts: { message: MessageType }): ValueOrPromise<void>;
  onMessageError(opts: { error: Error }): ValueOrPromise<void>;
}

/** Message buses held by a worker thread, keyed by name. */
export interface IWorkerThread {
  buses: {
    [workerKey: string | symbol]: IWorkerBus<AnyType, AnyType>;
  };
}

/** The callbacks a bus invokes for the events of its port. */
export interface IWorkerMessageBusHandler<IConsumePayload> {
  onMessage: (opts: { message: IConsumePayload }) => ValueOrPromise<void>;

  onClose: () => ValueOrPromise<void>;
  onError: (opts: { error: Error }) => ValueOrPromise<void>;
  onExit: (opts: { exitCode: number | string }) => ValueOrPromise<void>;
}

/** A message channel over a `MessagePort`: `handler` receives incoming messages, `postMessage` sends outgoing ones, with optional hooks around each send. */
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
