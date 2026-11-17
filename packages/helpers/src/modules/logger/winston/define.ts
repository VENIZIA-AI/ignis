import type winston from 'winston';
import { WinstonFormatFactory } from './formats';
import { WinstonLoggerFactory } from './logger-factory';

/** The winston format that renders an application log line; the default logger uses it. */
export const applicationLogFormatter: winston.Logform.Format =
  WinstonFormatFactory.applicationLogFormatter;

/** Module-internal only - NOT re-exported from `winston/index.ts`; the default winston backing WinstonLogger falls back to. */
export const defaultWinstonLogger = WinstonLoggerFactory.defaultLogger();
