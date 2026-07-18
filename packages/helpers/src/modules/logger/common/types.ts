import { AnyType } from '@/common/types';
import { TLogLevel } from './constants';

/**
 * The logging contract every consumer types against; which provider produced the logger is
 * invisible behind it - only `factory.ts` and a provider's back-compat aliases may name a
 * concrete logger class.
 */
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
