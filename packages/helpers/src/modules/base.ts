import { ILogger } from '@/modules/logger/common/types';
import { resolveHelperLogger, setHelperLogger } from '@/modules/logger/slot';

export class BaseHelper {
  scope: string;
  identifier: string;

  constructor(opts: { scope: string; identifier?: string }) {
    this.scope = opts.scope ?? '';
    this.identifier = opts.identifier ?? '';
  }

  /** The helper's logger, resolved on first read - a helper that never logs never builds one. */
  get logger(): ILogger {
    return resolveHelperLogger({
      helper: this,
      scopes: [this.scope, this.identifier].filter(scope => scope && scope.length > 0),
    });
  }

  /** Installs one logger on this helper - a test spy, or a host overriding the global resolver. */
  set logger(value: ILogger) {
    setHelperLogger({ helper: this, logger: value });
  }

  getIdentifier() {
    return this.identifier;
  }

  getLogger(): ILogger {
    return this.logger;
  }
}
