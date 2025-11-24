import isEmpty from 'lodash/isEmpty';
import { applicationLogger } from './default-logger';
import { getError } from '@/helpers/error';
import winston from 'winston';
import { TLogLevel } from './types';

const extraLogEnvs =
  (process.env.APP_ENV_EXTRA_LOG_ENVS ?? '').split(',').map(el => el.trim()) ?? [];
const LOG_ENVIRONMENTS = new Set([
  'local',
  'development',
  'alpha',
  'beta',
  'staging',
  ...extraLogEnvs,
]);

export class Logger {
  private readonly environment: string | undefined = process.env.NODE_ENV;

  private scopes: string[] = [];
  private customLogger?: winston.Logger;

  constructor(opts?: { customLogger?: winston.Logger }) {
    this.customLogger = opts?.customLogger;
  }

  // ---------------------------------------------------------------------
  private getLogger() {
    return this.customLogger ?? applicationLogger;
  }

  // ---------------------------------------------------------------------
  private _enhanceMessage(parts: string[], message: string) {
    const enhanced = parts?.reduce((prevState = '', current: string) => {
      if (isEmpty(prevState)) {
        return current;
      }

      return prevState.concat(`-${current}`);
    }, '');

    return `[${enhanced}]${message}`;
  }

  // ---------------------------------------------------------------------
  withScope(scope: string) {
    if (this.scopes.length < 2) {
      this.scopes.push(scope);
      return this;
    }

    while (this.scopes.length > 2) {
      this.scopes.pop();
    }

    this.scopes[1] = scope;
    return this;
  }

  // ---------------------------------------------------------------------
  log(level: TLogLevel, message: string, ...args: any[]) {
    const logger = this.getLogger();
    if (!logger) {
      throw getError({ message: `[doLog] Level: ${level} | Invalid logger instance!` });
    }

    const enhanced = this._enhanceMessage(this.scopes, message);
    logger.log(level, enhanced, ...args);
  }

  // ---------------------------------------------------------------------
  debug(message: string, ...args: any[]) {
    if (this.environment && !LOG_ENVIRONMENTS.has(this.environment)) {
      return;
    }

    if (!process.env.DEBUG) {
      return;
    }

    this.log('debug', message, ...args);
  }

  // ---------------------------------------------------------------------
  info(message: string, ...args: any[]) {
    this.log('info', message, ...args);
  }

  // ---------------------------------------------------------------------
  warn(message: string, ...args: any[]) {
    this.log('warn', message, ...args);
  }

  // ---------------------------------------------------------------------
  error(message: string, ...args: any[]) {
    this.log('error', message, ...args);
  }

  // ---------------------------------------------------------------------
  emerg(message: string, ...args: any[]) {
    this.log('emerg', message, ...args);
  }
}

export class ApplicationLogger extends Logger {}
