import { toError, voidExecution } from '@/utilities/promise.utility';
import { isMainThread, Worker, WorkerOptions } from 'node:worker_threads';

import { AnyType, ValueOrPromise } from '@/common/types';
import { BaseHelper } from '@/modules/base';
import { getError } from '@/modules/error';
import { IWorker, IWorkerBus, IWorkerThread } from './types';

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

  /** User handlers run inside worker listeners; a sync throw there is uncaught and kills the process, so wrap it - voidExecution alone can't catch a throw evaluated before it's called. */
  protected invokeHook(opts: { scope: string; execution: () => ValueOrPromise<void> }) {
    const { scope, execution } = opts;

    try {
      voidExecution({ logger: this.logger, scope, execution: execution() });
    } catch (error) {
      this.logger.for(scope).error('Hook execution FAILED | Error: %s', error);
    }
  }

  override onOnline(): ValueOrPromise<void> {
    if (this.eventHandlers?.onOnline) {
      this.invokeHook({
        scope: this.onOnline.name,
        execution: () => this.eventHandlers?.onOnline?.(),
      });
      return;
    }

    this.logger.for(this.onOnline.name).info('Worker ONLINE');
  }

  override onExit(opts: { code: string | number }): ValueOrPromise<void> {
    if (this.eventHandlers?.onExit) {
      this.invokeHook({
        scope: this.onExit.name,
        execution: () => this.eventHandlers?.onExit?.({ code: opts.code }),
      });
      return;
    }

    this.logger.for(this.onExit.name).warn('Worker EXIT | Code: %s', opts.code);
  }

  override onError(opts: { error: Error }): ValueOrPromise<void> {
    if (this.eventHandlers?.onError) {
      this.invokeHook({
        scope: this.onError.name,
        execution: () => this.eventHandlers?.onError?.({ error: opts.error }),
      });
      return;
    }

    this.logger.for(this.onError.name).error('Worker ERROR | Error: %s', opts.error);
  }

  override onMessage(opts: { message: MessageType }): ValueOrPromise<void> {
    if (this.eventHandlers?.onMessage) {
      this.invokeHook({
        scope: this.onMessage.name,
        execution: () => this.eventHandlers?.onMessage?.({ message: opts.message }),
      });
      return;
    }

    this.logger.for(this.onMessage.name).error('Worker MESSAGE | message: %j', opts.message);
  }

  override onMessageError(opts: { error: Error }): ValueOrPromise<void> {
    if (this.eventHandlers?.onMessageError) {
      this.invokeHook({
        scope: this.onMessageError.name,
        execution: () => this.eventHandlers?.onMessageError?.({ error: opts.error }),
      });
      return;
    }

    this.logger.for(this.onMessageError.name).error('Worker MESSAGE_ERROR | Error: %s', opts.error);
  }

  binding() {
    if (!this.worker) {
      throw getError({ message: '[binding] Invalid worker instance to bind event handlers' });
    }

    this.worker.on('online', () => {
      this.invokeHook({ scope: this.binding.name, execution: () => this.onOnline() });
    });

    this.worker.on('exit', code => {
      this.invokeHook({ scope: this.binding.name, execution: () => this.onExit({ code }) });
    });

    this.worker.on('error', error => {
      this.invokeHook({
        scope: this.binding.name,
        execution: () => this.onError({ error: toError(error) }),
      });
    });

    this.worker.on('message', message => {
      this.invokeHook({ scope: this.binding.name, execution: () => this.onMessage({ message }) });
    });

    this.worker.on('messageerror', error => {
      this.invokeHook({
        scope: this.binding.name,
        execution: () => this.onMessageError({ error }),
      });
    });
  }
}

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
      this.logger.for(this.bindWorkerBus.name).warn('Worker Bus existed | key: %s', key);
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
      this.logger.for(this.unbindWorkerBus.name).warn('Worker Bus not existed | key: %s', key);
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
