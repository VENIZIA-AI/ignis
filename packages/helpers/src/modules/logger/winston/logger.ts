import winston from 'winston';
import { AnyType } from '@/common/types';
import { BaseLogger } from '../base';
import { ILogger, TLogLevel } from '../common';
import { defaultWinstonLogger } from './define';

export class WinstonLogger extends BaseLogger {
  private static cache = new Map<string, WinstonLogger>();
  private readonly _logger: winston.Logger;

  private constructor(scope: string, logger: winston.Logger) {
    super({ scope });
    this._logger = logger;
  }

  /** Default-backed loggers are cached per scope; a custom-backed logger is a fresh wrapper every call - a scope-keyed cache can't tell different winston instances apart. */
  static get(scope: string, customLogger?: winston.Logger): WinstonLogger {
    if (customLogger) {
      return new WinstonLogger(scope, customLogger);
    }

    let cached = this.cache.get(scope);
    if (!cached) {
      cached = new WinstonLogger(scope, defaultWinstonLogger);
      this.cache.set(scope, cached);
    }

    return cached;
  }

  protected write(opts: { level: TLogLevel; message: string; args: Array<AnyType> }) {
    this._logger.log(opts.level, this._formattedPrefix + opts.message, ...opts.args);
  }

  protected child(opts: { scope: string }): ILogger {
    if (this._logger === defaultWinstonLogger) {
      return WinstonLogger.get(opts.scope);
    }

    return new WinstonLogger(opts.scope, this._logger);
  }
}

export { WinstonLogger as Logger };
