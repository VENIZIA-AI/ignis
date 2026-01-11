import { Defaults } from '@/common/constants';
import { TConstValue } from '@/common/types';
import { int } from '@/utilities/parse.utility';
import path from 'node:path';
import winston from 'winston';
import 'winston-daily-rotate-file';
import { DgramTransport, IDgramTransportOptions } from './transports';
import { getError } from '@venizia/ignis-inversion';

const LOGGER_FOLDER_PATH = process.env.APP_ENV_LOGGER_FOLDER_PATH ?? './';
const LOGGER_PREFIX = Defaults.APPLICATION_NAME;
const LOGGER_FORMAT = process.env.APP_ENV_LOGGER_FORMAT ?? 'text';

// File rotation defaults (can be overridden via env or options)
const LOGGER_FILE_FREQUENCY = process.env.APP_ENV_LOGGER_FILE_FREQUENCY ?? '1h';
const LOGGER_FILE_MAX_SIZE = process.env.APP_ENV_LOGGER_FILE_MAX_SIZE ?? '100m';
const LOGGER_FILE_MAX_FILES = process.env.APP_ENV_LOGGER_FILE_MAX_FILES ?? '5d';
const LOGGER_FILE_DATE_PATTERN = process.env.APP_ENV_LOGGER_FILE_DATE_PATTERN ?? 'YYYYMMDD_HH';

const f = winston.format;

// -------------------------------------------------------------------------------------------
export class LoggerFormats {
  static readonly JSON = 'json';
  static readonly TEXT = 'text';

  static readonly SCHEME_SET = new Set([this.JSON, this.TEXT]);

  static isValid(orgType: string): boolean {
    return this.SCHEME_SET.has(orgType);
  }
}

export type TLoggerFormat = TConstValue<typeof LoggerFormats>;

// -------------------------------------------------------------------------------------------
export const defineJsonLoggerFormatter = (opts: { label: string }) => {
  return f.combine(
    f.label({ label: opts.label }),
    f.timestamp(),
    f.splat(),
    f.errors({ stack: true }),
    f.json(),
    f.colorize(),
  );
};

// -------------------------------------------------------------------------------------------
export const definePrettyLoggerFormatter = (opts: { label: string }) => {
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
export const defineLogFormatter = (opts: { label: string; format?: TLoggerFormat }) => {
  const format = opts.format ?? (LOGGER_FORMAT as TLoggerFormat);

  switch (format) {
    case LoggerFormats.JSON: {
      return defineJsonLoggerFormatter({ label: opts.label });
    }
    case LoggerFormats.TEXT: {
      return definePrettyLoggerFormatter({ label: opts.label });
    }
    default: {
      throw getError({
        message: `[defineLogger] Invalid logger format | format: ${format} | valids: ${[...LoggerFormats.SCHEME_SET]}`,
      });
    }
  }
};

// -------------------------------------------------------------------------------------------
export const applicationLogFormatter = defineLogFormatter({ label: LOGGER_PREFIX });

// -------------------------------------------------------------------------------------------
export interface IFileTransportOptions {
  prefix: string;
  folder: string;
  frequency?: string;
  maxSize?: string;
  maxFiles?: string;
  datePattern?: string;
}

export interface ICustomLoggerOptions {
  logLevels?: { [name: string | symbol]: number };
  logColors?: { [name: string | symbol]: string };
  loggerFormatter?: ReturnType<typeof winston.format.combine>;
  transports: {
    info: {
      file?: IFileTransportOptions;
      dgram?: Partial<IDgramTransportOptions>;
    };
    error: {
      file?: IFileTransportOptions;
      dgram?: Partial<IDgramTransportOptions>;
    };
  };
}

export const defineCustomLogger = (opts: ICustomLoggerOptions) => {
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
    const fileOpts = infoTransportOptions.file;
    const transport = new winston.transports.DailyRotateFile({
      frequency: fileOpts.frequency ?? LOGGER_FILE_FREQUENCY,
      maxSize: fileOpts.maxSize ?? LOGGER_FILE_MAX_SIZE,
      maxFiles: fileOpts.maxFiles ?? LOGGER_FILE_MAX_FILES,
      datePattern: fileOpts.datePattern ?? LOGGER_FILE_DATE_PATTERN,
      filename: path.join(fileOpts.folder, `/${fileOpts.prefix}-info-%DATE%.log`),
      level: 'info',
    });

    transports.general.push(transport);
  }

  if (errorTransportOptions.file) {
    const fileOpts = errorTransportOptions.file;
    const transport = new winston.transports.DailyRotateFile({
      frequency: fileOpts.frequency ?? LOGGER_FILE_FREQUENCY,
      maxSize: fileOpts.maxSize ?? LOGGER_FILE_MAX_SIZE,
      maxFiles: fileOpts.maxFiles ?? LOGGER_FILE_MAX_FILES,
      datePattern: fileOpts.datePattern ?? LOGGER_FILE_DATE_PATTERN,
      filename: path.join(fileOpts.folder, `/${fileOpts.prefix}-error-%DATE%.log`),
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
