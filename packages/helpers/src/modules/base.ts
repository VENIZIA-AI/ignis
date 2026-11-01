import { LoggerFactory } from '@/modules/logger/factory';
import { type ILogger } from '@/modules/logger/common/types';

/** Pins a logger on a helper instance: later reads are a plain property read, not its getter. A module function, not a private static: a mixin that extends `BaseHelper` could not be emitted with a private member. */
const pinLogger = (opts: { helper: object; logger: ILogger }): void => {
  Object.defineProperty(opts.helper, 'logger', {
    value: opts.logger,
    writable: true,
    configurable: true,
    enumerable: false,
  });
};

export class BaseHelper {
  scope: string;
  identifier: string;

  constructor(opts: { scope: string; identifier?: string }) {
    this.scope = opts.scope ?? '';
    this.identifier = opts.identifier ?? '';
  }

  /** The helper's logger, resolved on first read - a helper that never logs never builds one. */
  get logger(): ILogger {
    const scopes = [this.scope, this.identifier].filter(
      (scope) => typeof scope === 'string' && scope.length > 0,
    );
    const logger = LoggerFactory.getLogger(scopes);

    // Read off a prototype (reflection walks them), pinning would shadow this getter for every instance.
    if (Object.hasOwn(this, 'scope')) {
      pinLogger({ helper: this, logger });
    }
    return logger;
  }

  /** Installs one logger on this helper - a test spy, or a host overriding the factory's logger. */
  set logger(value: ILogger) {
    pinLogger({ helper: this, logger: value });
  }

  getIdentifier() {
    return this.identifier;
  }

  getLogger(): ILogger {
    return this.logger;
  }
}
