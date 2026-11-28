import { type TValueOrPromise } from '@/common/types';
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

  onOnline(): TValueOrPromise<void>;
  onExit(opts: { code: string | number }): TValueOrPromise<void>;
  onError(opts: { error: Error }): TValueOrPromise<void>;
  onMessage(opts: { message: MessageType }): TValueOrPromise<void>;
  onMessageError(opts: { error: Error }): TValueOrPromise<void>;
}

/** Message buses held by a worker thread, keyed by name. */
export interface IWorkerThread {
  buses: {
    [workerKey: string | symbol]: IWorkerBus<never, never>;
  };
}

/** The callbacks a bus invokes for the events of its port. */
export interface IWorkerMessageBusHandler<IConsumePayload> {
  onMessage: (opts: { message: IConsumePayload }) => TValueOrPromise<void>;

  onClose: () => TValueOrPromise<void>;
  onError: (opts: { error: Error }) => TValueOrPromise<void>;
  onExit: (opts: { exitCode: number | string }) => TValueOrPromise<void>;
}

/** A message channel over a `MessagePort`: `handler` receives incoming messages, `postMessage` sends outgoing ones, with optional hooks around each send. */
export interface IWorkerBus<IConsumePayload, IPublishPayload> {
  port: MessagePort;
  handler: IWorkerMessageBusHandler<IConsumePayload>;

  onBeforePostMessage?(opts: { message: IPublishPayload }): TValueOrPromise<void>;
  onAfterPostMessage?(opts: { message: IPublishPayload }): TValueOrPromise<void>;
  postMessage(opts: {
    message: IPublishPayload;
    transferList: readonly Transferable[] | undefined;
  }): TValueOrPromise<void>;
}
