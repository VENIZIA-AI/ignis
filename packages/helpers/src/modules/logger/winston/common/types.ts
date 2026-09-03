import dgram from 'node:dgram';
import winston from 'winston';
import Transport from 'winston-transport';
import { TLogLevel, TLoggerFormat } from '../../common';

export interface IDgramTransportOptions extends Transport.TransportStreamOptions {
  label: string;
  host: string;
  port: number;
  levels: Array<string>;
  socketOptions: dgram.SocketOptions;
}

export interface IFileTransportOptions {
  prefix: string;
  folder: string;
  frequency?: string;
  maxSize?: string;
  maxFiles?: string;
  datePattern?: string;
}

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
