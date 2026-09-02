import { AnyType } from '@/common/types';
import { BaseLogger } from '../base';
import { ILogger, TLogLevel } from '../common';
import { formatLogMessage } from '../formatting';
import { PinoBackingLogger } from './backing';

/** pino provider satisfying `ILoggerProvider`, staying pino-native: numeric levels, `msg`, epoch `time`, pid/hostname pass through unchanged. No custom-instance param on `get()` unlike `WinstonLogger.get` - advanced/test injection goes through `PinoBackingLogger.set()`. */
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

  /** Resolves the backing instance at WRITE time and never caches it, so `PinoBackingLogger.set()` takes effect for every already-issued scope immediately. */
  protected write(opts: { level: TLogLevel; message: string; args: Array<AnyType> }) {
    const line =
      opts.args.length > 0
        ? formatLogMessage({ message: opts.message, args: opts.args })
        : opts.message;

    const backing = PinoBackingLogger.get() as AnyType;
    backing[opts.level](this._formattedPrefix + line);
  }

  protected child(opts: { scope: string }): ILogger {
    return PinoLogger.get(opts.scope);
  }
}
