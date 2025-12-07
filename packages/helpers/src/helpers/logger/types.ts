import { TConstValue } from '@/common/types';

export class LogLevels {
  static readonly ERROR = 'error';
  static readonly ALERT = 'alert';
  static readonly EMERG = 'emerg';
  static readonly WARN = 'warn';
  static readonly INFO = 'info';
  static readonly HTTP = 'http';
  static readonly VERBOSE = 'verbose';
  static readonly DEBUG = 'debug';
  static readonly SILLY = 'silly';

  static readonly SCHEME_SET = new Set([
    this.ERROR,
    this.ALERT,
    this.EMERG,
    this.WARN,
    this.INFO,
    this.HTTP,
    this.VERBOSE,
    this.DEBUG,
    this.SILLY,
  ]);

  static isValid(input: string): boolean {
    return this.SCHEME_SET.has(input);
  }
}

export type TLogLevel = TConstValue<typeof LogLevels>;
