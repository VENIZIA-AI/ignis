import { AnyType } from '@/common/types';
import omit from 'lodash/omit';
import { MessageCode } from './message-code';
import { TError } from './types';

export class ApplicationError extends Error {
  statusCode: number;
  messageCode: string;
  extra?: Record<string, unknown>;

  constructor(opts: TError) {
    const { message, messageCode, statusCode = 400, ...rest } = opts;
    super(message);

    this.statusCode = statusCode;
    this.messageCode = MessageCode.resolve(messageCode);
    const extra = omit(rest, ['name']);
    this.extra = Object.keys(extra).length > 0 ? extra : undefined;
  }

  static getError(opts: TError) {
    return new ApplicationError(opts);
  }
}

export const getError = (opts: TError) => {
  return new ApplicationError(opts);
};

/**
 * Recognizes an application error by SHAPE, not by class identity.
 *
 * `instanceof ApplicationError` is not enough: an error raised by the DI container carries
 * inversion's class, and inversion's dual CJS/ESM build gives even that class two runtime
 * identities. A CJS consumer and an ESM consumer therefore hold different constructors for the
 * same source. Code that must tell "an error the framework already shaped" from "a raw failure to
 * sanitize" - the search connectors do exactly that before wrapping anything else as a 503 - has
 * to test the shape instead, or a real 404 arrives at the caller as a bogus 503.
 */
export const isApplicationError = (error: unknown): error is ApplicationError => {
  return error instanceof Error && typeof (error as AnyType).statusCode === 'number';
};
