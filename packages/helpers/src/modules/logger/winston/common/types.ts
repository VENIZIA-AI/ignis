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

/** Daily-rotating log file written to `<folder>/<prefix>-<level>-%DATE%.log`. An unset `frequency`, `maxSize`, `maxFiles` or `datePattern` falls back to its `APP_ENV_LOGGER_FILE_*` setting. */
export interface IFileTransportOptions {
  prefix: string;
  folder: string;
  frequency?: string;
  maxSize?: string;
  maxFiles?: string;
  datePattern?: string;
}

/** Options for building a winston logger; `transports.info` and `transports.error` each take an optional file and datagram transport. */
export interface ICustomLoggerOptions {
  levels?: { [name: string | symbol]: number };
  colors?: { [name: string | symbol]: string };

  /** Full override of the logger-level format; when provided, transports get NO format of their own - the override is applied once for every transport, exactly as it produces the line. */
  formatter?: ReturnType<typeof winston.format.combine>;

  /** Output shape per transport. Defaults to `APP_ENV_LOGGER_FORMAT` (`text`). */
  format?: TLoggerFormat;

  /** Logger-level floor. Defaults to `APP_ENV_LOGGER_LEVEL`, then `debug`. */
  level?: TLogLevel;

  /** ANSI color on the console transport in `text` mode. Defaults to `APP_ENV_LOGGER_COLOR`, then OFF outside a development `NODE_ENV`. Ignored when `formatter` is set - that override owns the whole line. */
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
