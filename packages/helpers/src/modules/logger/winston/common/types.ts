import type dgram from 'node:dgram';
import type winston from 'winston';
import type Transport from 'winston-transport';
import { type TLogLevel, type TLoggerFormat } from '../../common';

/** Options of `DgramTransport`. Only lines whose level is in `levels` are sent, as UDP datagrams to `host:port`, tagged with `label`; `socketOptions` go to `dgram.createSocket`. */
export interface IDgramTransportOptions extends Transport.TransportStreamOptions {
  label: string;
  host: string;
  port: number;
  levels: Array<string>;
  socketOptions: dgram.SocketOptions;
}

/** Daily-rotating log file written to `<folder>/<prefix>-<level>-%DATE%.log`. */
export interface IFileTransportOptions {
  prefix: string;
  folder: string;
  /**
   * How often the file rotates.
   * @default the `APP_ENV_LOGGER_FILE_FREQUENCY` setting, else `'1h'`
   */
  frequency?: string;
  /**
   * Size at which a file rotates.
   * @default the `APP_ENV_LOGGER_FILE_MAX_SIZE` setting, else `'100m'`
   */
  maxSize?: string;
  /**
   * How many files, or days of files, are kept.
   * @default the `APP_ENV_LOGGER_FILE_MAX_FILES` setting, else `'5d'`
   */
  maxFiles?: string;
  /**
   * The date format in the file name.
   * @default the `APP_ENV_LOGGER_FILE_DATE_PATTERN` setting, else `'YYYYMMDD_HH'`
   */
  datePattern?: string;
}

/** Options for building a winston logger; `transports.info` and `transports.error` each take an optional file and datagram transport. */
export interface ICustomLoggerOptions {
  levels?: { [name: string | symbol]: number };
  colors?: { [name: string | symbol]: string };

  /** Full override of the logger-level format; when provided, transports get NO format of their own - the override is applied once for every transport, exactly as it produces the line. */
  formatter?: ReturnType<typeof winston.format.combine>;

  /**
   * Output shape per transport.
   * @default the `APP_ENV_LOGGER_FORMAT` setting, else `'text'`
   */
  format?: TLoggerFormat;

  /**
   * Logger-level floor.
   * @default the `APP_ENV_LOGGER_LEVEL` setting, else `'debug'`
   */
  level?: TLogLevel;

  /**
   * ANSI color on the console transport in `text` mode. Ignored when `formatter` is set - that override owns the whole line.
   * @default the `APP_ENV_LOGGER_COLOR` setting; else `false` under `NO_COLOR` or outside a development `NODE_ENV`; else `true`
   */
  colorize?: boolean;

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
