import { App } from '@/common';
import path from 'node:path';

import winston from 'winston';
import 'winston-daily-rotate-file';
import { DgramTransport, IDgramTransportOptions } from './transports';
import { int } from '@/utilities';

const LOGGER_FOLDER_PATH = process.env.APP_ENV_LOGGER_FOLDER_PATH ?? './';
const LOGGER_PREFIX = App.APPLICATION_NAME;
const f = winston.format;

// -------------------------------------------------------------------------------------------
export const defineCustomLoggerFormatter = (opts: { label: string }) => {
  return f.combine(
    f.simple(),
    f.label({ label: opts.label }),
    f.timestamp(),
    f.splat(),
    f.align(),
    f.colorize(),
    f.printf(({ level, message, label, timestamp }) => {
      return `${timestamp} [${label}] ${level}: ${message}`;
    }),
    f.errors({ stack: true }),
  );
};

// -------------------------------------------------------------------------------------------
export const applicationLogFormatter = defineCustomLoggerFormatter({ label: LOGGER_PREFIX });

// -------------------------------------------------------------------------------------------
export const defineCustomLogger = (opts: {
  logLevels?: { [name: string | symbol]: number };
  logColors?: { [name: string | symbol]: string };
  loggerFormatter?: ReturnType<typeof winston.format.combine>;
  transports: {
    info: {
      file?: { prefix: string; folder: string };
      dgram?: Partial<IDgramTransportOptions>;
    };
    error: {
      file?: { prefix: string; folder: string };
      dgram?: Partial<IDgramTransportOptions>;
    };
  };
}) => {
  const {
    logLevels = {
      error: 0,
      alert: 0,
      emerg: 0,
      warn: 1,
      info: 2,
      http: 3,
      verbose: 4,
      debug: 5,
      silly: 6,
    },
    logColors = {
      error: 'red',
      alert: 'red',
      emerg: 'red',
      warn: 'yellow',
      info: 'green',
      http: 'magenta',
      verbose: 'gray',
      debug: 'blue',
      silly: 'gray',
    },
    loggerFormatter = applicationLogFormatter,
    transports: { info: infoTransportOptions, error: errorTransportOptions },
  } = opts;

  const consoleLogTransport = new winston.transports.Console({ level: 'debug' });
  const transports: {
    general: Array<winston.transport>;
    exception: Array<winston.transport>;
  } = {
    general: [consoleLogTransport],
    exception: [consoleLogTransport],
  };

  // File configure
  if (infoTransportOptions.file) {
    const transport = new winston.transports.DailyRotateFile({
      frequency: '1h',
      maxSize: '100m',
      maxFiles: '5d',
      datePattern: 'YYYYMMDD_HH',
      filename: path.join(
        infoTransportOptions.file.folder,
        `/${infoTransportOptions.file.prefix}-info-%DATE%.log`,
      ),
      level: 'info',
    });

    transports.general.push(transport);
  }

  if (errorTransportOptions.file) {
    const transport = new winston.transports.DailyRotateFile({
      frequency: '1h',
      maxSize: '100m',
      maxFiles: '5d',
      datePattern: 'YYYYMMDD_HH',
      filename: path.join(
        errorTransportOptions.file.folder,
        `/${errorTransportOptions.file.prefix}-error-%DATE%.log`,
      ),
      level: 'error',
    });

    transports.general.push(transport);
    transports.exception.push(transport);
  }

  // Stream configure
  if (infoTransportOptions.dgram) {
    const transport = DgramTransport.fromPartial(infoTransportOptions.dgram);
    if (transport) {
      transports.general.push(transport);
    }
  }

  if (errorTransportOptions.dgram) {
    const transport = DgramTransport.fromPartial(errorTransportOptions.dgram);
    if (transport) {
      transports.exception.push(transport);
    }
  }

  // Color configure
  winston.addColors(logColors);

  // Logger
  return winston.createLogger({
    levels: logLevels,
    format: loggerFormatter,
    exitOnError: false,
    transports: transports.general,
    exceptionHandlers: transports.exception,
  });
};

// -------------------------------------------------------------------------------------------
const fileOptions = { folder: LOGGER_FOLDER_PATH, prefix: LOGGER_PREFIX };
const dgramOptions: Partial<IDgramTransportOptions> = {
  socketOptions: { type: 'udp4' },
  host: process.env.APP_ENV_LOGGER_DGRAM_HOST,
  port: int(process.env.APP_ENV_LOGGER_DGRAM_PORT),
  label: process.env.APP_ENV_LOGGER_DGRAM_LABEL,
  levels: process.env.APP_ENV_LOGGER_DGRAM_LEVELS?.split(',').map(el => el.trim()) ?? [],
};

// -------------------------------------------------------------------------------------------
export const applicationLogger = defineCustomLogger({
  transports: {
    info: { file: fileOptions, dgram: dgramOptions },
    error: { file: fileOptions, dgram: dgramOptions },
  },
});
