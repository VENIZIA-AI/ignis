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
const { DEBUG } = process.env;
export const SHOULD_LOG_DEBUG =
  toBoolean(DEBUG) && (!Environment.ambient || LOG_ENVIRONMENTS.has(Environment.ambient));

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

/**
 * Whether log lines may carry ANSI color, resolved at CALL time. First match wins:
 *
 * 1. `APP_ENV_LOGGER_COLOR` - an explicit yes or no from the operator.
 * 2. `NO_COLOR`, set to anything non-empty - the no-color.org convention.
 * 3. `NODE_ENV` outside {@link Environment.DEVELOPMENT_ENVS} - production, staging, uat and any
 *    unrecognized name. Fail-closed, the same boundary the error sanitizer draws: colors are a
 *    terminal affordance, and in a deployed environment the same bytes land in a file or an
 *    aggregator as escape noise every grep then has to strip.
 *
 * `undefined` means the framework has no opinion, so a provider that detects a terminal itself
 * keeps deciding - which is why the pino path forwards nothing in that case.
 */
export const resolveLoggerColorize = (opts?: {
  configured?: string;
  environment?: string;
}): boolean | undefined => {
  const configured = opts?.configured ?? process.env.APP_ENV_LOGGER_COLOR;
  if (configured !== undefined && configured.trim() !== '') {
    return toBoolean(configured.trim().toLowerCase());
  }

  const noColor = process.env.NO_COLOR;
  if (noColor !== undefined && noColor !== '') {
    return false;
  }

  const environment = opts?.environment ?? Environment.current;
  if (!Environment.DEVELOPMENT_ENVS.has(environment)) {
    return false;
  }

  return undefined;
};
