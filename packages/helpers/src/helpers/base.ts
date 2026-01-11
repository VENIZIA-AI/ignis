import { Logger, LoggerFactory } from '@/helpers/logger';

export class BaseHelper {
  scope: string;
  identifier: string;
  logger: Logger;

  constructor(opts: { scope: string; identifier?: string }) {
    this.logger = LoggerFactory.getLogger(
      [opts.scope, opts.identifier ?? ''].filter(el => el && el.length > 0),
    );

    this.scope = opts.scope ?? '';
    this.identifier = opts.identifier ?? '';
  }

  getIdentifier() {
    return this.identifier;
  }

  getLogger() {
    return this.logger;
  }
}
