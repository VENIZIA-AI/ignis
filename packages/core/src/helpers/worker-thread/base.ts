import { isMainThread, Worker, WorkerOptions } from 'node:worker_threads';

import { BaseHelper } from '@/base/helpers';
import { AnyType, ValueOrPromise } from '@/common/types';
import { getError } from '@/helpers/error';
import { IWorker, IWorkerBus, IWorkerThread } from './types';

// -------------------------------------------------------------------------------------------
// WORKER
// -------------------------------------------------------------------------------------------
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

// -------------------------------------------------------------------------------------------
export class BaseWorkerHelper<MessageType> extends AbstractWorkerHelper<MessageType> {
  protected eventHandlers?: Partial<
    Pick<IWorker<MessageType>, 'onOnline' | 'onExit' | 'onError' | 'onMessage' | 'onMessageError'>
  >;

  constructor(opts: {
    scope?: string;
    identifier: string;
    path: string | URL;
    options: WorkerOptions;
    eventHandlers?: Partial<
      Pick<IWorker<MessageType>, 'onOnline' | 'onExit' | 'onError' | 'onMessage' | 'onMessageError'>
    >;
  }) {
    super({ scope: BaseWorkerHelper.name, identifier: opts.identifier });
    this.worker = new Worker(opts.path, opts.options);
    this.eventHandlers = opts.eventHandlers;

    this.binding();
  }

  override onOnline(): ValueOrPromise<void> {
    if (this.eventHandlers?.onOnline) {
      this.eventHandlers.onOnline();
      return;
    }

    this.logger.info('[online] Worker ONLINE');
  }

  override onExit(opts: { code: string | number }): ValueOrPromise<void> {
    if (this.eventHandlers?.onExit) {
      this.eventHandlers.onExit({ code: opts.code });
      return;
    }

    this.logger.warn('[onExit] Worker EXIT | Code: %s', opts.code);
  }

  override onError(opts: { error: Error }): ValueOrPromise<void> {
    if (this.eventHandlers?.onError) {
      this.eventHandlers.onError({ error: opts.error });
      return;
    }

    this.logger.error('[onError] Worker ERROR | Error: %s', opts.error);
  }

  override onMessage(opts: { message: MessageType }): ValueOrPromise<void> {
    if (this.eventHandlers?.onMessage) {
      this.eventHandlers.onMessage({ message: opts.message });
      return;
    }

    this.logger.error('[onMessage] Worker MESSAGE | message: %j', opts.message);
  }

  override onMessageError(opts: { error: Error }): ValueOrPromise<void> {
    if (this.eventHandlers?.onMessageError) {
      this.eventHandlers.onMessageError({ error: opts.error });
      return;
    }

    this.logger.error('[onMessageError] Worker MESSAGE_ERROR | Error: %s', opts.error);
  }

  binding() {
    if (!this.worker) {
      throw getError({ message: '[binding] Invalid worker instance to bind event handlers' });
    }

    this.worker.on('online', () => {
      this.onOnline();
    });

    this.worker.on('exit', code => {
      this.onExit({ code });
    });

    this.worker.on('error', error => {
      this.onError({ error });
    });

    this.worker.on('message', message => {
      this.onMessage({ message });
    });

    this.worker.on('messageerror', error => {
      this.onMessageError({ error });
    });
  }
}

// -------------------------------------------------------------------------------------------
// WORKER THREAD RUNNER
// -------------------------------------------------------------------------------------------
export abstract class AbstractWorkerThreadHelper extends BaseHelper implements IWorkerThread {
  buses: {
    [workerKey: string | symbol]: IWorkerBus<AnyType, AnyType>;
  };

  abstract bindWorkerBus<IC, IP>(opts: {
    key: string;
    bus: IWorkerBus<IC, IP>;
  }): ValueOrPromise<void>;

  abstract getWorkerBus<IC, IP>(opts: { key: string }): IWorkerBus<IC, IP>;
}

// -------------------------------------------------------------------------------------------
export class BaseWorkerThreadHelper extends AbstractWorkerThreadHelper {
  constructor(opts: { scope: string }) {
    const { scope } = opts;
    super({ scope, identifier: scope });

    if (isMainThread) {
      throw getError({
        message: '[BaseWorker] Cannot start worker in MAIN_THREAD',
      });
    }

    this.buses = {};
  }

  bindWorkerBus<IC, IP>(opts: { key: string; bus: IWorkerBus<IC, IP> }) {
    if (!this.buses) {
      this.buses = {};
    }

    const { key, bus } = opts;
    if (this.buses[key]) {
      this.logger.warn('[bindWorkerBus] Worker Bus existed | key: %s', key);
      return;
    }

    this.buses[key] = bus;
  }

  unbindWorkerBus(opts: { key: string }) {
    if (!this.buses) {
      return;
    }

    const { key } = opts;
    if (!(key in this.buses)) {
      this.logger.warn('[unbindWorkerBus] Worker Bus not existed | key: %s', key);
      return;
    }

    this.buses[key]?.port?.removeAllListeners();
    delete this.buses[key];
  }

  getWorkerBus<IC, IP>(opts: { key: string }) {
    const rs = this.buses[opts.key];
    if (!rs) {
      throw getError({
        message: `[getWorkerBus] Not found worker bus | key: ${opts.key}`,
      });
    }

    return rs as IWorkerBus<IC, IP>;
  }
}
