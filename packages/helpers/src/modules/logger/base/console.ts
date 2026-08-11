import { AnyType } from '@/common/types';
import { ILogger, LogLevels, TLogLevel } from '../common/types';
import { AbstractLogger } from './abstract';

/** The resolver's default when no provider is registered - the only logger a browser bundle can reach. Extends AbstractLogger rather than BaseLogger because BaseLogger's DEBUG gate reads process.env at module load. */
export class ConsoleLogger extends AbstractLogger {
  private readonly prefix: string;

  private constructor(private readonly scope: string) {
    super();
    this.prefix = scope !== '' ? `[${scope}] ` : '';
  }

  static get(opts: { scope: string }): ILogger {
    return new ConsoleLogger(opts.scope);
  }

  private emit(opts: {
    sink: (message: string, ...args: AnyType[]) => void;
    message: string;
    args: AnyType[];
  }) {
    opts.sink(`${this.prefix}${opts.message}`, ...opts.args);
  }

  debug(message: string, ...args: AnyType[]) {
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
    return ConsoleLogger.get({ scope: childScope });
  }
}
