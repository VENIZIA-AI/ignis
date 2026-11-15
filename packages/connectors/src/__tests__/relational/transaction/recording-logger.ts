import type { ILogger, TLogLevel } from '@venizia/ignis-helpers/core';

export interface IRecordedLog {
  level: TLogLevel;
  method: string;
  message: string;
  args: unknown[];
}

/** Records every call, with the method name `for()` scoped it to, for inspection after the act. */
export class RecordingLogger implements ILogger {
  readonly calls: IRecordedLog[];

  private readonly method: string;

  constructor(opts?: { method?: string; calls?: IRecordedLog[] }) {
    this.method = opts?.method ?? '';
    this.calls = opts?.calls ?? [];
  }

  debug(message: string, ...args: unknown[]): void {
    this.log('debug', message, ...args);
  }

  info(message: string, ...args: unknown[]): void {
    this.log('info', message, ...args);
  }

  warn(message: string, ...args: unknown[]): void {
    this.log('warn', message, ...args);
  }

  error(message: string, ...args: unknown[]): void {
    this.log('error', message, ...args);
  }

  emerg(message: string, ...args: unknown[]): void {
    this.log('emerg', message, ...args);
  }

  log(level: TLogLevel, message: string, ...args: unknown[]): void {
    this.calls.push({ level, method: this.method, message, args });
  }

  for(methodName: string): ILogger {
    return new RecordingLogger({ method: methodName, calls: this.calls });
  }

  countAt(opts: { level: TLogLevel }): number {
    return this.calls.filter((call) => call.level === opts.level).length;
  }
}
