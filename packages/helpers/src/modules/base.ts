import { ILogger } from '@/modules/logger/common/types';
import { pinHelperLogger, resolveHelperLogger } from '@/modules/logger/slot';

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
      scope => typeof scope === 'string' && scope.length > 0,
    );
    const logger = resolveHelperLogger({ scopes });

    // Read off a prototype (reflection walks them), pinning would shadow this getter for every instance.
    if (Object.hasOwn(this, 'scope')) {
      pinHelperLogger({ helper: this, logger });
    }
    return logger;
  }

  /** Installs one logger on this helper - a test spy, or a host overriding the global resolver. */
  set logger(value: ILogger) {
    pinHelperLogger({ helper: this, logger: value });
  }

  getIdentifier() {
    return this.identifier;
  }

  getLogger(): ILogger {
    return this.logger;
  }
}
