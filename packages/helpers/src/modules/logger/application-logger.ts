import { toBoolean } from '@/utilities/parse.utility';
import winston from 'winston';
import { applicationLogger } from './default-logger';
import { TLogLevel } from './types';
import { Environment } from '../env';

const extraLogEnvs =
  (process.env.APP_ENV_EXTRA_LOG_ENVS ?? '').split(',').map(el => el.trim()) ?? [];
const LOG_ENVIRONMENTS = new Set([...Array.from(Environment.COMMON_ENVS), ...extraLogEnvs]);
const isDebugEnabled = toBoolean(process.env.DEBUG);
const CURRENT_ENV = process.env.NODE_ENV;
const shouldLogDebug = isDebugEnabled && (!CURRENT_ENV || LOG_ENVIRONMENTS.has(CURRENT_ENV));

export class Logger {
  private static cache = new Map<string, Logger>();
  private readonly _formattedPrefix: string;
  private readonly _logger: winston.Logger;

  private constructor(scope: string, logger: winston.Logger) {
    this._formattedPrefix = `[${scope}] `;
    this._logger = logger;
  }

  /** Get or create a cached logger for the given scope. */
  static get(scope: string, customLogger?: winston.Logger): Logger {
    if (!customLogger) {
      let cached = this.cache.get(scope);
      if (cached) {
        return cached;
      }

      cached = new Logger(scope, applicationLogger);
      this.cache.set(scope, cached);
      return cached;
    }

    const cacheKey = scope + ':custom';
    let cached = this.cache.get(cacheKey);

    if (!cached) {
      cached = new Logger(scope, customLogger);
      this.cache.set(cacheKey, cached);
    }

    return cached;
  }

  /** Get a method-scoped sub-logger. */
  for(methodName: string): Logger {
    const scope = this._formattedPrefix.slice(1, -2);
    return Logger.get(scope + '-' + methodName);
  }

  debug(message: string, ...args: any[]) {
    if (!shouldLogDebug) {
      return;
    }
    this._logger.debug(this._formattedPrefix + message, ...args);
  }

  info(message: string, ...args: any[]) {
    this._logger.info(this._formattedPrefix + message, ...args);
  }

  warn(message: string, ...args: any[]) {
    this._logger.warn(this._formattedPrefix + message, ...args);
  }

  error(message: string, ...args: any[]) {
    this._logger.error(this._formattedPrefix + message, ...args);
  }

  emerg(message: string, ...args: any[]) {
    this._logger.emerg(this._formattedPrefix + message, ...args);
  }

  log(level: TLogLevel, message: string, ...args: any[]) {
    this._logger.log(level, this._formattedPrefix + message, ...args);
  }
}

export const ApplicationLogger = Logger;
// eslint-disable-next-line @typescript-eslint/naming-convention
export type ApplicationLogger = Logger;
