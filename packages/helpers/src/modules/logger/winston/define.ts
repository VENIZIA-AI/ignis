import winston from 'winston';
import { WinstonFormatFactory } from './formats';
import { WinstonLoggerFactory } from './logger-factory';

export const applicationLogFormatter: winston.Logform.Format =
  WinstonFormatFactory.applicationLogFormatter;
export const defineCustomLogger = WinstonLoggerFactory.defineCustomLogger;
export const defineJsonLoggerFormatter = WinstonFormatFactory.json;
export const defineLogFormatter = WinstonFormatFactory.log;
export const definePrettyLoggerFormatter = WinstonFormatFactory.pretty;
export const resolveDefaultTransportOptions = WinstonLoggerFactory.resolveDefaultTransportOptions;

/** Module-internal only - NOT re-exported from `winston/index.ts`; the default winston backing WinstonLogger falls back to. */
export const defaultWinstonLogger = WinstonLoggerFactory.defaultLogger();
