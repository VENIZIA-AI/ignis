import { toBoolean } from '@/utilities/parse.utility';
import winston from 'winston';
import { applicationLogger } from './default-logger';
import { TLogLevel } from './types';
import { Environment } from '../env';

// Pre-computed at module load - ZERO runtime cost
const extraLogEnvs =
  (process.env.APP_ENV_EXTRA_LOG_ENVS ?? '').split(',').map(el => el.trim()) ?? [];
const LOG_ENVIRONMENTS = new Set([...Array.from(Environment.COMMON_ENVS), ...extraLogEnvs]);
const isDebugEnabled = toBoolean(process.env.DEBUG);
const CURRENT_ENV = process.env.NODE_ENV;
const shouldLogDebug = isDebugEnabled && (!CURRENT_ENV || LOG_ENVIRONMENTS.has(CURRENT_ENV));

export class Logger {
  // Cache: same scope = same logger instance
  private static cache = new Map<string, Logger>();

  // Pre-formatted prefix with brackets - computed once at construction
  private readonly _formattedPrefix: string;
  private readonly _logger: winston.Logger;

  private constructor(scope: string, logger: winston.Logger) {
    this._formattedPrefix = `[${scope}] `;
    this._logger = logger;
  }

  // ---------------------------------------------------------------------
  /**
   * Get or create a logger for a scope. Cached globally.
   * @example
   * const logger = Logger.get('UserService');
   * logger.info('message'); // [UserService] message
   */
  static get(scope: string, customLogger?: winston.Logger): Logger {
    // Fast path: default logger (most common case)
    if (!customLogger) {
      let cached = this.cache.get(scope);
      if (cached) {
        return cached;
      }

      cached = new Logger(scope, applicationLogger);
      this.cache.set(scope, cached);
      return cached;
    }

    // Slow path: custom logger
    const cacheKey = scope + ':custom';
    let cached = this.cache.get(cacheKey);

    if (!cached) {
      cached = new Logger(scope, customLogger);
      this.cache.set(cacheKey, cached);
    }

    return cached;
  }

  // ---------------------------------------------------------------------
  /**
   * Get a method-scoped logger. Cached globally.
   * @example
   * Logger.get('UserService').for('createUser').info('done');
   * // [UserService-createUser] done
   */
  for(methodName: string): Logger {
    // Extract scope from formatted prefix (remove [ and ] )
    const scope = this._formattedPrefix.slice(1, -2);
    return Logger.get(scope + '-' + methodName);
  }

  // ---------------------------------------------------------------------
  // Inlined log methods - direct calls for minimal overhead

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

  // Generic log method (kept for flexibility, but prefer specific methods)
  log(level: TLogLevel, message: string, ...args: any[]) {
    this._logger.log(level, this._formattedPrefix + message, ...args);
  }
}

// Backward compatibility - export both value and type
export const ApplicationLogger = Logger;
// eslint-disable-next-line @typescript-eslint/naming-convention
export type ApplicationLogger = Logger;
