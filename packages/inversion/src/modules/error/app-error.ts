import omit from 'lodash/omit';
import { AnyType } from '@/common/types';
import { MessageCode } from './message-code';
import type { TErrorDefinition } from './definition';
import type { TError, TErrorNormalized } from './types';

/** Keys the constructor consumes. Everything else is context and rides into `extra`. */
const KNOWN_KEYS = [
  'error',
  'message',
  'messageCode',
  'statusCode',
  'messageArgs',
  'cause',
  'extra',
  'transform',
  'name',
];

export class ApplicationError extends Error {
  statusCode: number;
  messageCode: string;
  normalized: TErrorNormalized;
  extra?: Record<string, unknown>;

  constructor(opts: TError) {
    const { statusCode, messageArgs, cause, extra, transform } = opts;

    // The index signature makes `'error' in opts` useless for narrowing - every key exists on both
    // members - so read the discriminant and cast.
    const definition = ('error' in opts ? opts.error : undefined) as TErrorDefinition | undefined;
    const message = (opts.message as string | undefined) ?? definition?.message ?? '';
    const messageCode = definition?.key ?? (opts.messageCode as string | undefined);

    super(message, cause === undefined ? undefined : { cause });

    this.statusCode = statusCode ?? definition?.statusCode ?? 400;
    this.messageCode = MessageCode.resolve(messageCode);

    const args = messageArgs ?? definition?.messageArgs;

    // Unknown keys sweep in first, then the `messageArgs` mirror, then explicit `extra` - so an
    // explicit value wins over one that arrived by accident.
    const merged = {
      ...omit(opts, KNOWN_KEYS),
      ...(args ? { messageArgs: args } : {}),
      ...extra,
    };
    this.extra = Object.keys(merged).length > 0 ? merged : undefined;

    this.normalized = transform
      ? transform({
          message,
          messageCode: this.messageCode,
          statusCode: this.statusCode,
          extra: this.extra,
        })
      : { text: message, code: this.messageCode, args: args ?? {} };
  }

  static getError(opts: TError) {
    return new ApplicationError(opts);
  }
}

export const getError = (opts: TError): ApplicationError => {
  return new ApplicationError(opts);
};

export const isApplicationError = (error: unknown): error is ApplicationError => {
  return error instanceof Error && typeof (error as AnyType).statusCode === 'number';
};
