import { int } from '@/utilities/parse.utility';
import path from 'node:path';
import winston from 'winston';
import 'winston-daily-rotate-file';
import { DgramTransport } from './transports';
import { ICustomLoggerOptions, IDgramTransportOptions } from './common';
import {
  LOGGER_FILE_DATE_PATTERN,
  LOGGER_FILE_FREQUENCY,
  LOGGER_FILE_MAX_FILES,
  LOGGER_FILE_MAX_SIZE,
  LOGGER_FORMAT,
  LOGGER_PREFIX,
} from './common/constants';
import { resolveLoggerColorize, resolveLoggerLevel, TLoggerFormat } from '../common';
import { WinstonFormatFactory } from './formats';

/**
 * Static methods never reach a sibling through `this` - the exported names in `define.ts` are
 * unbound aliases (`WinstonLoggerFactory.method`), so `this` would be `undefined` there.
 */
export class WinstonLoggerFactory {
  private static _defaultLogger?: winston.Logger;

  static defineCustomLogger(opts: ICustomLoggerOptions) {
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
      colorize = resolveLoggerColorize() ?? true,
      transports: { info: infoTransportOptions, error: errorTransportOptions },
    } = opts;

    const assemblyFormats = formatter ? null : WinstonFormatFactory.assembly({ format, colorize });
    const loggerFormat = formatter ?? WinstonFormatFactory.prep({ label: LOGGER_PREFIX });

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
  }

  /** Default transports from `APP_ENV_LOGGER_*`, resolved at CALL time. File logging is opt-in - without `APP_ENV_LOGGER_FOLDER_PATH` no rotating file is created. */
  static resolveDefaultTransportOptions(): ICustomLoggerOptions['transports'] {
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
  }

  /**
   * Lazy and cached - a plain module-level eager instance would build a winston logger (and read
   * env vars) at import time for every consumer of the barrel, even one that never logs through
   * the default.
   */
  static defaultLogger(): winston.Logger {
    return (WinstonLoggerFactory._defaultLogger ??= WinstonLoggerFactory.defineCustomLogger({
      transports: WinstonLoggerFactory.resolveDefaultTransportOptions(),
    }));
  }
}
