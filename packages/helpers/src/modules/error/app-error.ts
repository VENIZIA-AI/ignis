import { TError } from './types';

export class ApplicationError extends Error {
  statusCode: number;
  messageCode?: string;
  extra?: Record<string, unknown>;

  constructor(opts: TError) {
    const { message, messageCode, statusCode = 400, name: _name, ...extra } = opts;
    super(message);

    this.statusCode = statusCode;
    this.messageCode = messageCode;
    this.extra = Object.keys(extra).length > 0 ? extra : undefined;
  }

  static getError(opts: TError) {
    return new ApplicationError(opts);
  }
}

export const getError = (opts: TError) => {
  return new ApplicationError(opts);
};
