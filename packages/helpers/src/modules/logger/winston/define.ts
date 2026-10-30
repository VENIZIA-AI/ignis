import type winston from 'winston';
import { WinstonFormatFactory } from './formats';
import { WinstonLoggerFactory } from './logger-factory';

export const applicationLogFormatter: winston.Logform.Format =
  WinstonFormatFactory.applicationLogFormatter;

/** @deprecated Use WinstonLoggerFactory.defineCustomLogger({ ... }). Removed in 0.5. */
export const defineCustomLogger = WinstonLoggerFactory.defineCustomLogger;

/** @deprecated Use WinstonFormatFactory.json({ label }). Removed in 0.5. */
export const defineJsonLoggerFormatter = WinstonFormatFactory.json;

/** @deprecated Use WinstonFormatFactory.log({ label, format }). Removed in 0.5. */
export const defineLogFormatter = WinstonFormatFactory.log;

/** @deprecated Use WinstonFormatFactory.pretty({ label, colorize }). Removed in 0.5. */
export const definePrettyLoggerFormatter = WinstonFormatFactory.pretty;

/** @deprecated Use WinstonLoggerFactory.resolveDefaultTransportOptions(). Removed in 0.5. */
export const resolveDefaultTransportOptions = WinstonLoggerFactory.resolveDefaultTransportOptions;

/** Module-internal only - NOT re-exported from `winston/index.ts`; the default winston backing WinstonLogger falls back to. */
export const defaultWinstonLogger = WinstonLoggerFactory.defaultLogger();
