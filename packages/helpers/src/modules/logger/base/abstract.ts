import { AnyType } from '@/common/types';

/** The leaf, not the `../common` barrel: that barrel reaches `constants.ts`, which reads `process.env` at module load. Both bindings here are types so a bundler erases the edge, but the source graph still carries it. */
import { ILogger, TLogLevel } from '../common/types';

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
