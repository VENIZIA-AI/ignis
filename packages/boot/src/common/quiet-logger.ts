import type { ILogger, TLogLevel } from '@venizia/ignis-helpers/core';
import { LogLevels } from '@venizia/ignis-helpers/core';

/** The generator's own output goes through `console.log`; framework diagnostics below `warn` are dropped and the rest land on stderr, so a codegen run prints nothing but its result on stdout. */
export class QuietLogger implements ILogger {
  private static readonly cache = new Map<string, QuietLogger>();
  private readonly prefix: string;

  private constructor(private readonly scope: string) {
    this.prefix = scope === '' ? '' : `[${scope}] `;
  }

  static get(scope: string): ILogger {
    const cached = this.cache.get(scope);
    if (cached) {
      return cached;
    }

    const created = new QuietLogger(scope);
    this.cache.set(scope, created);
    return created;
  }

  private write(opts: { message: string; args: unknown[] }): void {
    console.error(`${this.prefix}${opts.message}`, ...opts.args);
  }

  debug(): void {}

  info(): void {}

  warn(message: string, ...args: unknown[]): void {
    this.write({ message, args });
  }

  error(message: string, ...args: unknown[]): void {
    this.write({ message, args });
  }

  emerg(message: string, ...args: unknown[]): void {
    this.write({ message, args });
  }

  log(level: TLogLevel, message: string, ...args: unknown[]): void {
    if (level === LogLevels.DEBUG || level === LogLevels.INFO) {
      return;
    }

    this.write({ message, args });
  }

  for(methodName: string): ILogger {
    return QuietLogger.get(this.scope === '' ? methodName : `${this.scope}-${methodName}`);
  }
}
