import { AnyType } from '@/common/types';
import { ILogger, TLogLevel } from '../common';

/** The ILogger contract as a class - for instanceof and implementations sharing no plumbing. */
export abstract class AbstractLogger implements ILogger {
  abstract debug(message: string, ...args: AnyType[]): void;
  abstract info(message: string, ...args: AnyType[]): void;
  abstract warn(message: string, ...args: AnyType[]): void;
  abstract error(message: string, ...args: AnyType[]): void;
  abstract emerg(message: string, ...args: AnyType[]): void;
  abstract log(level: TLogLevel, message: string, ...args: AnyType[]): void;
  abstract for(methodName: string): ILogger;
}
