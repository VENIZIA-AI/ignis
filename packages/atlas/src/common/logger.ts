import type { ILogger, TLogLevel } from '@venizia/ignis-helpers/core';
import { LogLevels } from '@venizia/ignis-helpers/core';

const LEVEL_RANK: Record<TLogLevel, number> = {
  [LogLevels.DEBUG]: 0,
  [LogLevels.INFO]: 1,
  [LogLevels.WARN]: 2,
  [LogLevels.ERROR]: 3,
  [LogLevels.EMERG]: 4,
};

/** The only values `APP_ENV_LOGGER_LEVEL` may set the threshold to - `emerg` is never a configured floor. */
const CONFIGURABLE_LEVEL_BY_NAME: Record<string, TLogLevel> = {
  [LogLevels.DEBUG]: LogLevels.DEBUG,
  [LogLevels.INFO]: LogLevels.INFO,
  [LogLevels.WARN]: LogLevels.WARN,
  [LogLevels.ERROR]: LogLevels.ERROR,
};

const DEFAULT_LEVEL: TLogLevel = LogLevels.INFO;

/** `APP_ENV_LOGGER_LEVEL` if it names a configurable level, else the default - read once per logger instance. */
const resolveThreshold = (): TLogLevel => {
  const configured = (process.env.APP_ENV_LOGGER_LEVEL ?? '').trim().toLowerCase();
  return CONFIGURABLE_LEVEL_BY_NAME[configured] ?? DEFAULT_LEVEL;
};

/**
 * Registered via `LoggerFactory.use({ provider: StderrLogger })` at the CLI entrypoint, before any
 * other import runs. A line at or above the threshold lands on `console.error` - stdout must carry
 * only JSON-RPC frames.
 */
export class StderrLogger implements ILogger {
  private static readonly cache = new Map<string, StderrLogger>();
  private readonly prefix: string;
  private readonly threshold: TLogLevel;

  private constructor(private readonly scope: string) {
    this.prefix = scope !== '' ? `[${scope}] ` : '';
    this.threshold = resolveThreshold();
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

  private write(opts: { level: TLogLevel; message: string; args: unknown[] }): void {
    if (LEVEL_RANK[opts.level] < LEVEL_RANK[this.threshold]) {
      return;
    }
    console.error(`${this.prefix}${opts.message}`, ...opts.args);
  }

  debug(message: string, ...args: unknown[]): void {
    this.write({ level: LogLevels.DEBUG, message, args });
  }

  info(message: string, ...args: unknown[]): void {
    this.write({ level: LogLevels.INFO, message, args });
  }

  warn(message: string, ...args: unknown[]): void {
    this.write({ level: LogLevels.WARN, message, args });
  }

  error(message: string, ...args: unknown[]): void {
    this.write({ level: LogLevels.ERROR, message, args });
  }

  emerg(message: string, ...args: unknown[]): void {
    this.write({ level: LogLevels.EMERG, message, args });
  }

  log(level: TLogLevel, message: string, ...args: unknown[]): void {
    this.write({ level, message, args });
  }

  for(methodName: string): ILogger {
    const childScope = this.scope !== '' ? `${this.scope}-${methodName}` : methodName;
    return StderrLogger.get(childScope);
  }
}
