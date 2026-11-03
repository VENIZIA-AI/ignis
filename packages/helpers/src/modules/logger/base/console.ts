import { type AnyType } from '@/common/types';
import { LoggerDebugGate } from '../common/debug-gate';
import { type ILogger, LogLevels, type TLogLevel } from '../common/types';
import { AbstractLogger } from './abstract';

/**
 * The default logger provider: it writes to the console, and it is the only provider a browser bundle reaches. It
 * satisfies `ILoggerProvider` (`ConsoleLogger.get(scope)`), so it is registered like Winston and Pino.
 *
 * Extends AbstractLogger rather than BaseLogger because BaseLogger's module graph reads `process.env` at load.
 * `debug` follows the rule of the other providers (`LoggerDebugGate`): off unless `DEBUG` is truthy and the
 * environment is allowed, and off in a browser, which has no `process`; `LoggerFactory.use({ level })` overrides it.
 */
export class ConsoleLogger extends AbstractLogger {
  private readonly prefix: string;

  private constructor(private readonly scope: string) {
    super();
    this.prefix = scope !== '' ? `[${scope}] ` : '';
  }

  static get(scope: string): ConsoleLogger {
    return new ConsoleLogger(scope);
  }

  private emit(opts: {
    sink: (message: string, ...args: AnyType[]) => void;
    message: string;
    args: AnyType[];
  }) {
    opts.sink(`${this.prefix}${opts.message}`, ...opts.args);
  }

  debug(message: string, ...args: AnyType[]) {
    if (!LoggerDebugGate.isOpen()) {
      return;
    }

    this.emit({ sink: console.debug, message, args });
  }

  info(message: string, ...args: AnyType[]) {
    this.emit({ sink: console.log, message, args });
  }

  warn(message: string, ...args: AnyType[]) {
    this.emit({ sink: console.warn, message, args });
  }

  error(message: string, ...args: AnyType[]) {
    this.emit({ sink: console.error, message, args });
  }

  emerg(message: string, ...args: AnyType[]) {
    this.emit({ sink: console.error, message, args });
  }

  log(level: TLogLevel, message: string, ...args: AnyType[]) {
    switch (level) {
      case LogLevels.DEBUG: {
        this.debug(message, ...args);
        return;
      }
      case LogLevels.WARN: {
        this.warn(message, ...args);
        return;
      }
      case LogLevels.ERROR:
      case LogLevels.EMERG: {
        this.error(message, ...args);
        return;
      }
      default: {
        this.info(message, ...args);
      }
    }
  }

  for(methodName: string): ILogger {
    const childScope = this.scope !== '' ? `${this.scope}-${methodName}` : methodName;
    return ConsoleLogger.get(childScope);
  }
}
