import { Logger } from './application-logger';

export class LoggerFactory {
  /**
   * Get a cached logger for the given scope.
   * Same scope always returns the same logger instance.
   * @example
   * const logger = LoggerFactory.getLogger(['UserService']);
   * logger.info('message'); // [UserService] message
   * logger.for('createUser').info('done'); // [UserService-createUser] done
   */
  static getLogger(scopes: string[]): Logger {
    return Logger.get(scopes.join('-'));
  }
}
