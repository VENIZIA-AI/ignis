import { type TValueOrPromise } from '@/common/types';
import { AbstractWorkerMessageBusHandlerHelper } from './abstract';

/** Bus handler built from callbacks. Only `onMessage` is required; a missing `onClose` does nothing, a missing `onExit` or `onError` logs. */
export class BaseWorkerMessageBusHandlerHelper<
  IConsumePayload,
> extends AbstractWorkerMessageBusHandlerHelper<IConsumePayload> {
  constructor(opts: {
    scope: string;
    onMessage: (opts: { message: IConsumePayload }) => TValueOrPromise<void>;
    onClose?: () => TValueOrPromise<void>;
    onError?: (opts: { error: Error }) => TValueOrPromise<void>;
    onExit?: (opts: { exitCode: number | string }) => TValueOrPromise<void>;
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
