import type { ILogger, TLogLevel } from '@venizia/ignis-helpers/core';

/** Records every call instead of asserting inline, so a test can inspect level/message/args after the fact. */
export class RecordingLogger implements ILogger {
  readonly calls: Array<{ level: TLogLevel; message: string; args: unknown[] }> = [];

  debug(message: string, ...args: unknown[]): void {
    this.calls.push({ level: 'debug', message, args });
  }

  info(message: string, ...args: unknown[]): void {
    this.calls.push({ level: 'info', message, args });
  }

  warn(message: string, ...args: unknown[]): void {
    this.calls.push({ level: 'warn', message, args });
  }

  error(message: string, ...args: unknown[]): void {
    this.calls.push({ level: 'error', message, args });
  }

  emerg(message: string, ...args: unknown[]): void {
    this.calls.push({ level: 'emerg', message, args });
  }

  log(level: TLogLevel, message: string, ...args: unknown[]): void {
    this.calls.push({ level, message, args });
  }

  for(_methodName: string): ILogger {
    return this;
  }
}
