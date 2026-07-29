import { TConstValue } from '@/common/types';
import { Environment } from '@/modules/env';
import { toBoolean } from '@/utilities/parse.utility';
import { LogLevels, type TLogLevel } from './types';

// -------------------------------------------------------------
export class LoggerFormats {
  static readonly JSON = 'json';
  static readonly TEXT = 'text';

  static readonly SCHEME_SET = new Set([this.JSON, this.TEXT]);

  static isValid(input: string): input is TLoggerFormat {
    return this.SCHEME_SET.has(input);
  }
}

export type TLoggerFormat = TConstValue<typeof LoggerFormats>;

// -------------------------------------------------------------
const extraLogEnvs = (process.env.APP_ENV_EXTRA_LOG_ENVS ?? '').split(',').map(el => el.trim());
const LOG_ENVIRONMENTS = new Set([...Array.from(Environment.COMMON_ENVS), ...extraLogEnvs]);

/** debug() gate, computed ONCE at module load: DEBUG truthy and NODE_ENV unset or allowlisted. Shared across every logger implementation - runtime env changes need a restart. */
export const SHOULD_LOG_DEBUG =
  toBoolean(process.env.DEBUG) &&
  (!process.env.NODE_ENV || LOG_ENVIRONMENTS.has(process.env.NODE_ENV));

/** The logger's own level, below which a line never reaches ANY transport. Defaults to `debug` - level gating belongs to the wrapper and each transport, and a stricter default here would silently drop lines the wrapper already let through. */
export const resolveLoggerLevel = (opts: { configured?: string }): TLogLevel => {
  const { configured } = opts;

  if (!configured || configured.trim() === '') {
    return LogLevels.DEBUG;
  }

  const normalized = configured.trim().toLowerCase();
  if (!LogLevels.isValid(normalized)) {
    // console, not Logger: the logger is being built - routing this warning through it would re-enter the very pipeline that is not configured yet.
    console.warn(
      '[resolveLoggerLevel] Invalid logger level | value: %s | valids: %s | fallback: %s',
      configured,
      [...LogLevels.SCHEME_SET],
      LogLevels.DEBUG,
    );
    return LogLevels.DEBUG;
  }

  return normalized as TLogLevel;
};
