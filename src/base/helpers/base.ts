import { ApplicationLogger, LoggerFactory } from '@/helpers/logger';

export class BaseHelper {
  protected _scope: string;
  protected identifier: string;
  protected logger: ApplicationLogger;

  constructor(opts: { scope: string; identifier?: string }) {
    this.logger = LoggerFactory.getLogger(
      [opts.scope, opts.identifier ?? ''].filter(el => el && el.length > 0),
    );

    this._scope = opts.scope ?? '';
    this.identifier = opts.identifier ?? '';
  }

  getIdentifier() {
    return this.identifier;
  }

  getLogger() {
    return this.logger;
  }
}
