import { BaseHelper } from '@/base/helpers';
import { ValueOrPromise } from '@/common/types';
import { MessagePort, Transferable } from 'node:worker_threads';
import { IWorkerBus, IWorkerMessageBusHandler } from './types';

// -------------------------------------------------------------------------------------------
export abstract class AbstractWorkerMessageBusHandlerHelper<IConsumePayload>
  extends BaseHelper
  implements IWorkerMessageBusHandler<IConsumePayload>
{
  onMessage: (opts: { message: IConsumePayload }) => ValueOrPromise<void>;
  onClose: () => ValueOrPromise<void>;
  onError: (opts: { error: Error }) => ValueOrPromise<void>;
  onExit: (opts: { exitCode: number | string }) => ValueOrPromise<void>;
}

// -------------------------------------------------------------------------------------------
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

    this.onClose = opts?.onClose ? opts.onClose : () => {};

    this.onExit = opts?.onExit
      ? opts.onExit
      : (_opts: { exitCode: string | number }) => {
          this.logger.warn('[onExit] worker EXITED | exitCode: %s', _opts.exitCode);
        };

    this.onError = opts?.onError
      ? opts.onError
      : (_opts: { error: Error }) => {
          this.logger.error('[onError] worker error: %s', _opts.error);
        };
  }
}

// -------------------------------------------------------------------------------------------
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

// -------------------------------------------------------------------------------------------
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

    // Initialize
    this.port = opts.port;
    this.handler = opts.busHandler;

    // Binding events
    this.port.on('message', message => {
      this.handler.onMessage({ message });
    });

    this.port.on('error', error => {
      this.handler.onError({ error });
    });

    this.port.on('messageerror', error => {
      this.handler.onError({ error });
    });

    this.port.on('exit', exitCode => {
      this.handler.onExit({ exitCode });
    });

    this.port.on('close', () => {
      this.handler.onClose();
    });
  }

  onBeforePostMessage?(opts: { message: IPublishPayload }): ValueOrPromise<void>;
  onAfterPostMessage?(opts: { message: IPublishPayload }): ValueOrPromise<void>;

  postMessage(opts: {
    message: IPublishPayload;
    transferList: readonly Transferable[] | undefined;
  }): ValueOrPromise<void> {
    if (!this.port) {
      this.logger.error('[postMessage] Failed to post message to main | Invalid parentPort!');
      return;
    }

    this.onBeforePostMessage?.(opts);
    this.port.postMessage(opts.message, opts.transferList);
    this.onAfterPostMessage?.(opts);
  }
}
