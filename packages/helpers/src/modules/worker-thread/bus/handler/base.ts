import { ValueOrPromise } from '@/common/types';
import { AbstractWorkerMessageBusHandlerHelper } from './abstract';

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
