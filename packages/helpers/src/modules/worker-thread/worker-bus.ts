import { ValueOrPromise } from '@/common/types';
import { BaseHelper } from '@/modules/base';
import { voidExecution } from '@/utilities/promise.utility';
import { MessagePort, Transferable } from 'node:worker_threads';
import { IWorkerBus, IWorkerMessageBusHandler } from './types';

export abstract class AbstractWorkerMessageBusHandlerHelper<IConsumePayload>
  extends BaseHelper
  implements IWorkerMessageBusHandler<IConsumePayload>
{
  onMessage: (opts: { message: IConsumePayload }) => ValueOrPromise<void>;
  onClose: () => ValueOrPromise<void>;
  onError: (opts: { error: Error }) => ValueOrPromise<void>;
  onExit: (opts: { exitCode: number | string }) => ValueOrPromise<void>;
}

export class BaseWorkerMessageBusHandlerHelper<
  IConsumePayload,
> extends AbstractWorkerMessageBusHandlerHelper<IConsumePayload> {
  constructor(opts: {
    scope: string;
    onMessage: (opts: { message: IConsumePayload }) => ValueOrPromise<void>;
    onClose?: () => ValueOrPromise<void>;
    onError?: (opts: { error: Error }) => ValueOrPromise<void>;
    onExit?: (opts: { exitCode: number | string }) => ValueOrPromise<void>;
  }) {
    super({ scope: opts.scope, identifier: opts.scope });

    this.onMessage = opts.onMessage;

    this.onClose = opts?.onClose ?? (() => {});

    this.onExit =
      opts?.onExit ??
      ((_opts: { exitCode: string | number }) => {
        this.logger.for(this.onExit.name).warn('worker EXITED | exitCode: %s', _opts.exitCode);
      });

    this.onError =
      opts?.onError ??
      ((_opts: { error: Error }) => {
        this.logger.for(this.onError.name).error('worker error: %s', _opts.error);
      });
  }
}

export abstract class AbstractWorkerBusHelper<IConsumePayload, IPublishPayload>
  extends BaseHelper
  implements IWorkerBus<IConsumePayload, IPublishPayload>
{
  port: MessagePort;
  handler: IWorkerMessageBusHandler<IConsumePayload>;

  abstract onBeforePostMessage?(opts: { message: IPublishPayload }): ValueOrPromise<void>;
  abstract onAfterPostMessage?(opts: { message: IPublishPayload }): ValueOrPromise<void>;
  abstract postMessage(opts: {
    message: IPublishPayload;
    transferList: readonly Transferable[] | undefined;
  }): ValueOrPromise<void>;
}

export class BaseWorkerBusHelper<IConsumePayload, IPublishPayload> extends AbstractWorkerBusHelper<
  IConsumePayload,
  IPublishPayload
> {
  constructor(opts: {
    scope: string;
    port: MessagePort;
    busHandler: IWorkerMessageBusHandler<IConsumePayload>;
  }) {
    super({ scope: opts.scope, identifier: opts.scope });

    this.port = opts.port;
    this.handler = opts.busHandler;

    this.port.on('message', message => {
      this.invokeHook({ scope: 'onMessage', execution: () => this.handler.onMessage({ message }) });
    });

    this.port.on('error', error => {
      this.invokeHook({ scope: 'onError', execution: () => this.handler.onError({ error }) });
    });

    this.port.on('messageerror', error => {
      this.invokeHook({ scope: 'onError', execution: () => this.handler.onError({ error }) });
    });

    this.port.on('exit', exitCode => {
      this.invokeHook({ scope: 'onExit', execution: () => this.handler.onExit({ exitCode }) });
    });

    this.port.on('close', () => {
      this.invokeHook({ scope: 'onClose', execution: () => this.handler.onClose() });
    });
  }

  /** Bus handlers run inside MessagePort listeners; a sync throw there is uncaught and kills the worker thread, so wrap it - voidExecution alone can't catch a throw evaluated before it's called. */
  protected invokeHook(opts: { scope: string; execution: () => ValueOrPromise<void> }) {
    const { scope, execution } = opts;

    try {
      voidExecution({ logger: this.logger, scope, execution: execution() });
    } catch (error) {
      this.logger.for(scope).error('Hook execution FAILED | Error: %s', error);
    }
  }

  onBeforePostMessage?(opts: { message: IPublishPayload }): ValueOrPromise<void>;
  onAfterPostMessage?(opts: { message: IPublishPayload }): ValueOrPromise<void>;

  postMessage(opts: {
    message: IPublishPayload;
    transferList: readonly Transferable[] | undefined;
  }): ValueOrPromise<void> {
    if (!this.port) {
      this.logger
        .for(this.postMessage.name)
        .error('Failed to post message to main | Invalid parentPort!');
      return;
    }

    this.invokeHook({
      scope: this.postMessage.name,
      execution: () => this.onBeforePostMessage?.(opts),
    });

    if (opts.transferList) {
      this.port.postMessage(opts.message, [...opts.transferList]);
    } else {
      this.port.postMessage(opts.message);
    }

    this.invokeHook({
      scope: this.postMessage.name,
      execution: () => this.onAfterPostMessage?.(opts),
    });
  }
}
