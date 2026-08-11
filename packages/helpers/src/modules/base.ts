import { ILogger } from '@/modules/logger/common/types';
import { LoggerResolver } from '@/modules/logger/resolver';

export class BaseHelper {
  scope: string;
  identifier: string;
  logger: ILogger;

  constructor(opts: { scope: string; identifier?: string }) {
    this.logger = LoggerResolver.resolve({
      scopes: [opts.scope, opts.identifier ?? ''].filter(el => el && el.length > 0),
    });

    this.scope = opts.scope ?? '';
    this.identifier = opts.identifier ?? '';
  }

  getIdentifier() {
    return this.identifier;
  }

  getLogger(): ILogger {
    return this.logger;
  }
}
