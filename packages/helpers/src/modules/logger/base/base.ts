import { AnyType } from '@/common/types';
import { ILogger, LogLevels, SHOULD_LOG_DEBUG, TLogLevel } from '../common';
import { AbstractLogger } from './abstract';

/** Provider-independent plumbing: scope, prefix, DEBUG gate, for(). Every level method funnels into ONE abstract write() sink; child() lets each provider keep its own caching policy. */
export abstract class BaseLogger extends AbstractLogger {
  protected readonly _scope: string;
  protected readonly _formattedPrefix: string;

  constructor(opts: { scope: string }) {
    super();
    this._scope = opts.scope;
    this._formattedPrefix = opts.scope !== '' ? `[${opts.scope}] ` : '';
  }

  protected abstract write(opts: { level: TLogLevel; message: string; args: Array<AnyType> }): void;

  protected abstract child(opts: { scope: string }): ILogger;

  debug(message: string, ...args: AnyType[]) {
    if (!SHOULD_LOG_DEBUG) {
      return;
    }
    this.write({ level: LogLevels.DEBUG, message, args });
  }

  info(message: string, ...args: AnyType[]) {
    this.write({ level: LogLevels.INFO, message, args });
  }

  warn(message: string, ...args: AnyType[]) {
    this.write({ level: LogLevels.WARN, message, args });
  }

  error(message: string, ...args: AnyType[]) {
    this.write({ level: LogLevels.ERROR, message, args });
  }

  emerg(message: string, ...args: AnyType[]) {
    this.write({ level: LogLevels.EMERG, message, args });
  }

  log(level: TLogLevel, message: string, ...args: AnyType[]) {
    this.write({ level, message, args });
  }

  for(methodName: string): ILogger {
    // An empty parent scope must not produce a leading dash - the child simply takes the method name as its whole scope.
    return this.child({ scope: this._scope !== '' ? `${this._scope}-${methodName}` : methodName });
  }
}
