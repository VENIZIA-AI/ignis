import { Logger } from './application-logger';

export class LoggerFactory {
  static getLogger(scopes: string[]): Logger {
    return Logger.get(scopes.join('-'));
  }
}
