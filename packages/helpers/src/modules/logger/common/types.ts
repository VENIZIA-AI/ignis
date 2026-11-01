import { type AnyType, type TConstValue } from '@/common/types';

export class LogLevels {
  static readonly ERROR = 'error';
  static readonly EMERG = 'emerg';
  static readonly WARN = 'warn';
  static readonly INFO = 'info';
  static readonly DEBUG = 'debug';

  static readonly SCHEME_SET = new Set([this.ERROR, this.EMERG, this.WARN, this.INFO, this.DEBUG]);

  /** From the most to the least severe: a threshold lets through its own level and every level before it. */
  static readonly ORDER: ReadonlyArray<string> = [
    this.EMERG,
    this.ERROR,
    this.WARN,
    this.INFO,
    this.DEBUG,
  ];

  static isValid(input: string): boolean {
    return this.SCHEME_SET.has(input);
  }

  /** Whether a line of `level` passes a `threshold`: `debug` lets everything through, `error` only `error` and `emerg`. */
  static isEnabled(opts: { level: string; threshold: string }): boolean {
    const { level, threshold } = opts;
    const levelRank = this.ORDER.indexOf(level);
    const thresholdRank = this.ORDER.indexOf(threshold);

    // An unknown level or threshold is never silenced: a typo must not hide a line.
    return levelRank < 0 || thresholdRank < 0 || levelRank <= thresholdRank;
  }
}

export type TLogLevel = TConstValue<typeof LogLevels>;

/** The logging contract every consumer types against; which provider produced the logger is invisible behind it - only `factory.ts` and a provider's back-compat aliases may name a concrete logger class. */
export interface ILogger {
  debug(message: string, ...args: AnyType[]): void;
  info(message: string, ...args: AnyType[]): void;
  warn(message: string, ...args: AnyType[]): void;
  error(message: string, ...args: AnyType[]): void;
  emerg(message: string, ...args: AnyType[]): void;
  log(level: TLogLevel, message: string, ...args: AnyType[]): void;
  for(methodName: string): ILogger;
}

/** Static-side contract a provider class satisfies - WinstonLogger and PinoLogger both do. */
export interface ILoggerProvider {
  get(scope: string): ILogger;
}
