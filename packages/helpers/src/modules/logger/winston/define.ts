import { Defaults } from '@/common/constants';
import { int } from '@/utilities/parse.utility';
import { getError } from '@venizia/ignis-inversion';
import path from 'node:path';
import winston from 'winston';
import 'winston-daily-rotate-file';
import { deepSplat } from './formatters';
import { DgramTransport } from './transports';
import { ICustomLoggerOptions, IDgramTransportOptions } from './common';
import { LoggerFormats, resolveLoggerLevel, TLoggerFormat } from '../common';

const LOGGER_PREFIX = Defaults.APPLICATION_NAME;
const LOGGER_FORMAT = process.env.APP_ENV_LOGGER_FORMAT ?? 'text';

const LOGGER_FILE_FREQUENCY = process.env.APP_ENV_LOGGER_FILE_FREQUENCY ?? '1h';
const LOGGER_FILE_MAX_SIZE = process.env.APP_ENV_LOGGER_FILE_MAX_SIZE ?? '100m';
const LOGGER_FILE_MAX_FILES = process.env.APP_ENV_LOGGER_FILE_MAX_FILES ?? '5d';
const LOGGER_FILE_DATE_PATTERN = process.env.APP_ENV_LOGGER_FILE_DATE_PATTERN ?? 'YYYYMMDD_HH';

const f = winston.format;

/** Per-line prep: label, timestamp, error normalization, deep splat. Final-string assembly is per-transport, so console can colorize while files/UDP get plain lines. */
const definePrepFormatter = (opts: { label: string }) => {
  return f.combine(
    f.label({ label: opts.label }),
    f.timestamp(),
    f.errors({ stack: true }),
    deepSplat(),
  );
};

const defineTextLineFormatter = () => {
  return f.printf(({ level, message, label, timestamp }) => {
    return `${timestamp} [${label}] ${level}: ${message}`;
  });
};

export const defineJsonLoggerFormatter = (opts: { label: string }) => {
  return f.combine(definePrepFormatter({ label: opts.label }), f.json());
};

export const definePrettyLoggerFormatter = (opts: { label: string; colorize?: boolean }) => {
  const { label, colorize = true } = opts;

  if (colorize) {
    return f.combine(
      definePrepFormatter({ label }),
      f.align(),
      f.colorize(),
      defineTextLineFormatter(),
    );
  }

  return f.combine(definePrepFormatter({ label }), f.align(), defineTextLineFormatter());
};

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

export const applicationLogFormatter = defineLogFormatter({ label: LOGGER_PREFIX });

/** Per-transport assembly formats: colorized console, plain file. */
const defineAssemblyFormats = (opts: { format: TLoggerFormat }) => {
  switch (opts.format) {
    case LoggerFormats.JSON: {
      return { console: f.json(), file: f.json() };
    }
    case LoggerFormats.TEXT: {
      return {
        console: f.combine(f.align(), f.colorize(), defineTextLineFormatter()),
        file: f.combine(f.align(), defineTextLineFormatter()),
      };
    }
    default: {
      throw getError({
        message: `[defineCustomLogger] Invalid logger format | format: ${opts.format} | valids: ${[...LoggerFormats.SCHEME_SET]}`,
      });
    }
  }
};

export const defineCustomLogger = (opts: ICustomLoggerOptions) => {
  const {
    levels = {
      error: 0,
      emerg: 0,
      warn: 1,
      info: 2,
      debug: 3,
    },
    colors = {
      error: 'red',
      emerg: 'red',
      warn: 'yellow',
      info: 'green',
      debug: 'blue',
    },
    formatter,
    format = LOGGER_FORMAT as TLoggerFormat,
    level = resolveLoggerLevel({ configured: process.env.APP_ENV_LOGGER_LEVEL }),
    transports: { info: infoTransportOptions, error: errorTransportOptions },
  } = opts;

  const assemblyFormats = formatter ? null : defineAssemblyFormats({ format });
  const loggerFormat = formatter ?? definePrepFormatter({ label: LOGGER_PREFIX });

  const consoleLogTransport = new winston.transports.Console({
    format: assemblyFormats?.console,
  });
  const transports: {
    general: Array<winston.transport>;
    exception: Array<winston.transport>;
  } = {
    general: [consoleLogTransport],
    exception: [consoleLogTransport],
  };

  if (infoTransportOptions.file) {
    const fileOpts = infoTransportOptions.file;
    const transport = new winston.transports.DailyRotateFile({
      frequency: fileOpts.frequency ?? LOGGER_FILE_FREQUENCY,
      maxSize: fileOpts.maxSize ?? LOGGER_FILE_MAX_SIZE,
      maxFiles: fileOpts.maxFiles ?? LOGGER_FILE_MAX_FILES,
      datePattern: fileOpts.datePattern ?? LOGGER_FILE_DATE_PATTERN,
      filename: path.join(fileOpts.folder, `/${fileOpts.prefix}-info-%DATE%.log`),
      level: 'info',
      format: assemblyFormats?.file,
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
      format: assemblyFormats?.file,
    });

    transports.general.push(transport);
    transports.exception.push(transport);
  }

  if (infoTransportOptions.dgram) {
    const transport = DgramTransport.fromPartial(infoTransportOptions.dgram);
    if (transport) {
      transports.general.push(transport);
    }
  }

  // Deliberate asymmetry with the file pair: error.dgram registers ONLY as an exception handler - ordinary error-level lines already ship over info.dgram's transport, and adding it to general would double-send every error line.
  if (errorTransportOptions.dgram) {
    const transport = DgramTransport.fromPartial(errorTransportOptions.dgram);
    if (transport) {
      transports.exception.push(transport);
    }
  }

  winston.addColors(colors);

  return winston.createLogger({
    levels,
    level,
    format: loggerFormat,
    exitOnError: false,
    transports: transports.general,
    exceptionHandlers: transports.exception,
  });
};

/** Default transports from `APP_ENV_LOGGER_*`, resolved at CALL time. File logging is opt-in - without `APP_ENV_LOGGER_FOLDER_PATH` no rotating file is created. */
export const resolveDefaultTransportOptions = (): ICustomLoggerOptions['transports'] => {
  const folderPath = process.env.APP_ENV_LOGGER_FOLDER_PATH;
  const fileOptions =
    folderPath && folderPath.trim() !== ''
      ? { folder: folderPath, prefix: LOGGER_PREFIX }
      : undefined;

  const dgramOptions: Partial<IDgramTransportOptions> = {
    socketOptions: { type: 'udp4' },
    host: process.env.APP_ENV_LOGGER_DGRAM_HOST,
    port: int(process.env.APP_ENV_LOGGER_DGRAM_PORT),
    label: process.env.APP_ENV_LOGGER_DGRAM_LABEL,
    levels: process.env.APP_ENV_LOGGER_DGRAM_LEVELS?.split(',').map(el => el.trim()) ?? [],
  };

  return {
    info: { file: fileOptions, dgram: dgramOptions },
    error: { file: fileOptions, dgram: dgramOptions },
  };
};

/** Module-internal only - NOT re-exported from `winston/index.ts`; the default winston backing WinstonLogger falls back to. */
export const defaultWinstonLogger = defineCustomLogger({
  transports: resolveDefaultTransportOptions(),
});
