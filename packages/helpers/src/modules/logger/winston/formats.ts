import { getError } from '@venizia/ignis-inversion';
import winston from 'winston';
import { type AnyType } from '@/common/types';
import { LOGGER_FORMAT, LOGGER_PREFIX } from './common/constants';
import { LoggerFormats, LoggerConfigUtility, type TLoggerFormat } from '../common';
import { LogFormatUtility } from '../formatting';

const f = winston.format;

/** Winston stashes the extra arguments of `logger.error(msg, ...args)` under this well-known key. */
const SPLAT = Symbol.for('splat');

/**
 * Static methods never reach a sibling through `this` - the exported names in `define.ts` are
 * unbound aliases (`WinstonFormatFactory.method`), so `this` would be `undefined` there.
 */
export class WinstonFormatFactory {
  /** Per-line prep: label, timestamp, error normalization, deep splat. Final-string assembly is per-transport, so console can colorize while files/UDP get plain lines. */
  static prep(opts: { label: string }) {
    return f.combine(
      f.label({ label: opts.label }),
      f.timestamp(),
      f.errors({ stack: true }),
      WinstonFormatFactory.deepSplat(),
    );
  }

  /** Drop-in replacement for `winston.format.splat()` that formats through {@link LogFormatUtility.formatMessage}; every transport reads `info.message`, so widening it here widens console, file and dgram at once. */
  static deepSplat() {
    return f((info) => {
      const args = (info as AnyType)[SPLAT] as Array<unknown> | undefined;

      if (!args?.length || typeof info.message !== 'string') {
        return info;
      }

      info.message = LogFormatUtility.formatMessage({ message: info.message, args });
      return info;
    })();
  }

  static textLine() {
    return f.printf(({ level, message, label, timestamp }) => {
      return `${timestamp} [${label}] ${level}: ${message}`;
    });
  }

  static json(opts: { label: string }) {
    return f.combine(WinstonFormatFactory.prep({ label: opts.label }), f.json());
  }

  static pretty(opts: { label: string; colorize?: boolean }) {
    // winston has no terminal detection of its own, so "no opinion" keeps the historical default.
    const { label, colorize = LoggerConfigUtility.resolveColorize() ?? true } = opts;

    if (colorize) {
      return f.combine(
        WinstonFormatFactory.prep({ label }),
        f.align(),
        f.colorize(),
        WinstonFormatFactory.textLine(),
      );
    }

    return f.combine(
      WinstonFormatFactory.prep({ label }),
      f.align(),
      WinstonFormatFactory.textLine(),
    );
  }

  static log(opts: { label: string; format?: TLoggerFormat }) {
    const format = opts.format ?? (LOGGER_FORMAT as TLoggerFormat);

    switch (format) {
      case LoggerFormats.JSON: {
        return WinstonFormatFactory.json({ label: opts.label });
      }
      case LoggerFormats.TEXT: {
        return WinstonFormatFactory.pretty({ label: opts.label });
      }
      default: {
        throw getError({
          message: `[defineLogger] Invalid logger format | format: ${format} | valids: ${[...LoggerFormats.SCHEME_SET]}`,
        });
      }
    }
  }

  /** Per-transport assembly formats: console may colorize, a file never does - ANSI bytes in a rotated log file are noise every grep has to strip. */
  static assembly(opts: { format: TLoggerFormat; colorize: boolean }) {
    switch (opts.format) {
      case LoggerFormats.JSON: {
        return { console: f.json(), file: f.json() };
      }
      case LoggerFormats.TEXT: {
        return {
          console: opts.colorize
            ? f.combine(f.align(), f.colorize(), WinstonFormatFactory.textLine())
            : f.combine(f.align(), WinstonFormatFactory.textLine()),
          file: f.combine(f.align(), WinstonFormatFactory.textLine()),
        };
      }
      default: {
        throw getError({
          message: `[defineCustomLogger] Invalid logger format | format: ${opts.format} | valids: ${[...LoggerFormats.SCHEME_SET]}`,
        });
      }
    }
  }

  static readonly applicationLogFormatter: winston.Logform.Format = WinstonFormatFactory.log({
    label: LOGGER_PREFIX,
  });
}
