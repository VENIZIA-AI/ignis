import { AnyType } from '@/common/types';
import { BaseLogger } from '../base';
import { ILogger, TLogLevel } from '../common';
import { formatLogMessage } from '../formatting';
import { getPinoBackingLogger } from './define';

/**
 * pino provider satisfying `ILoggerProvider`. Stays pino-native: numeric levels, `msg`, epoch
 * `time`, pid/hostname pass through unchanged. No custom-instance param on `get()` (unlike
 * `WinstonLogger.get`) - advanced/test injection goes through `setPinoBackingLogger()` instead.
 */
export class PinoLogger extends BaseLogger {
  private static cache = new Map<string, PinoLogger>();

  private constructor(scope: string) {
    super({ scope });
  }

  static get(scope: string): PinoLogger {
    let cached = this.cache.get(scope);
    if (!cached) {
      cached = new PinoLogger(scope);
      this.cache.set(scope, cached);
    }

    return cached;
  }

  /**
   * Resolves the backing instance at WRITE time, never caches it - so `setPinoBackingLogger()`
   * takes effect for every already-issued scope immediately.
   */
  protected write(opts: { level: TLogLevel; message: string; args: Array<AnyType> }) {
    const line =
      opts.args.length > 0
        ? formatLogMessage({ message: opts.message, args: opts.args })
        : opts.message;

    const backing = getPinoBackingLogger() as AnyType;
    backing[opts.level](this._formattedPrefix + line);
  }

  protected child(opts: { scope: string }): ILogger {
    return PinoLogger.get(opts.scope);
  }
}
