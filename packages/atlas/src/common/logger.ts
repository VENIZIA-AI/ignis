import type { ILogger, TLogLevel } from '@venizia/ignis-helpers/core';

/**
 * Registered via `LoggerFactory.use({ provider: StderrLogger })` at the CLI entrypoint, before any
 * other import runs. Every level lands on `console.error` - stdout must carry only JSON-RPC frames.
 */
export class StderrLogger implements ILogger {
  private static readonly cache = new Map<string, StderrLogger>();
  private readonly prefix: string;

  private constructor(private readonly scope: string) {
    this.prefix = scope !== '' ? `[${scope}] ` : '';
  }

  static get(scope: string): ILogger {
    const cached = this.cache.get(scope);
    if (cached) {
      return cached;
    }

    const created = new StderrLogger(scope);
    this.cache.set(scope, created);
    return created;
  }

  private write(opts: { message: string; args: unknown[] }): void {
    console.error(`${this.prefix}${opts.message}`, ...opts.args);
  }

  debug(message: string, ...args: unknown[]): void {
    this.write({ message, args });
  }

  info(message: string, ...args: unknown[]): void {
    this.write({ message, args });
  }

  warn(message: string, ...args: unknown[]): void {
    this.write({ message, args });
  }

  error(message: string, ...args: unknown[]): void {
    this.write({ message, args });
  }

  emerg(message: string, ...args: unknown[]): void {
    this.write({ message, args });
  }

  log(_level: TLogLevel, message: string, ...args: unknown[]): void {
    this.write({ message, args });
  }

  for(methodName: string): ILogger {
    const childScope = this.scope !== '' ? `${this.scope}-${methodName}` : methodName;
    return StderrLogger.get(childScope);
  }
}
