import { TError } from './types';

export class ApplicationError extends Error {
  statusCode: number;
  messageCode?: string;

  constructor(opts: TError) {
    const { message, messageCode, statusCode = 400 } = opts;
    super(message);

    this.statusCode = statusCode;
    this.messageCode = messageCode;
  }

  static getError(opts: TError) {
    return new ApplicationError(opts);
  }
}

export const getError = (opts: TError) => {
  return new ApplicationError(opts);
};
