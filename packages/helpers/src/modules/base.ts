import { LoggerFactory } from '@/modules/logger/factory';
import { type ILogger } from '@/modules/logger/common/types';

export class BaseHelper {
  scope: string;
  identifier: string;

  constructor(opts: { scope: string; identifier?: string }) {
    this.scope = opts.scope ?? '';
    this.identifier = opts.identifier ?? '';
  }

  /** Pins a logger on a helper instance: later reads are a plain property read, not its getter. */
  private static pinLogger(opts: { helper: object; logger: ILogger }): void {
    Object.defineProperty(opts.helper, 'logger', {
      value: opts.logger,
      writable: true,
      configurable: true,
      enumerable: false,
    });
  }

  /** The helper's logger, resolved on first read - a helper that never logs never builds one. */
  get logger(): ILogger {
    const scopes = [this.scope, this.identifier].filter(
      (scope) => typeof scope === 'string' && scope.length > 0,
    );
    const logger = LoggerFactory.getLogger(scopes);

    // Read off a prototype (reflection walks them), pinning would shadow this getter for every instance.
    if (Object.hasOwn(this, 'scope')) {
      BaseHelper.pinLogger({ helper: this, logger });
    }
    return logger;
  }

  /** Installs one logger on this helper - a test spy, or a host overriding the factory's logger. */
  set logger(value: ILogger) {
    BaseHelper.pinLogger({ helper: this, logger: value });
  }

  getIdentifier() {
    return this.identifier;
  }

  getLogger(): ILogger {
    return this.logger;
  }
}
