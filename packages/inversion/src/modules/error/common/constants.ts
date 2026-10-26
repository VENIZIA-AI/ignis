import type { TConstValue } from '@/common/types';

/** Declared here, not imported from helpers' `LogLevels` (browser-safe); a helpers guard pins them equal. */
export class ErrorLogLevels {
  static readonly ERROR = 'error';
  static readonly EMERG = 'emerg';
  static readonly WARN = 'warn';
  static readonly INFO = 'info';
  static readonly DEBUG = 'debug';

  static readonly SCHEME_SET = new Set<string>([
    this.ERROR,
    this.EMERG,
    this.WARN,
    this.INFO,
    this.DEBUG,
  ]);

  static isValid(value: string): boolean {
    return this.SCHEME_SET.has(value);
  }
}

/** The level an error is logged at. */
export type TErrorLogLevel = TConstValue<typeof ErrorLogLevels>;
