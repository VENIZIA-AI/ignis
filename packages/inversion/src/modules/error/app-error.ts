import omit from 'lodash/omit';
import { AnyType, TNullable } from '@/common/types';
import { MessageCode } from './message-code';
import type { TError, TErrorDefinition, TErrorMessageInput, TErrorNormalized } from './types';

/** Consumed keys. Everything else rides into `extra`. */
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
  normalized: TErrorNormalized;
  extra?: Record<string, unknown>;

  constructor(opts: TError) {
    const { statusCode, messageArgs, cause, extra, transform } = opts;

    // Index signature defeats `in` narrowing - read the discriminant and cast.
    const definition = ('error' in opts ? opts.error : undefined) as TNullable<TErrorDefinition>;

    const input = opts.message as TNullable<string | Partial<TErrorMessageInput>>;
    const override = typeof input === 'string' ? { text: input } : input;

    // `?.message?.` - the optional chain has to guard BOTH: `error` reaches here from an untyped
    // call site as anything at all, and a bare `definition?.message.text` throws on a malformed one.
    const message = override?.text ?? definition?.message?.text ?? '';
    const messageCode = MessageCode.resolve(
      override?.code ?? definition?.message?.code ?? (opts.messageCode as TNullable<string>),
    );
    const args = override?.args ?? messageArgs ?? definition?.message?.args;

    super(message, cause === undefined ? undefined : { cause });

    this.statusCode = statusCode ?? definition?.statusCode ?? 400;

    // Explicit `extra` wins over swept keys.
    const merged = {
      ...omit(opts, KNOWN_KEYS),
      ...extra,
    };
    this.extra = Object.keys(merged).length > 0 ? merged : undefined;

    const normalized: TErrorNormalized = { text: message, code: messageCode, args: args ?? {} };

    this.normalized = transform
      ? transform({ message: normalized, statusCode: this.statusCode, extra: this.extra })
      : normalized;
  }

  static getError(opts: TError) {
    return new ApplicationError(opts);
  }
}

export const getError = (opts: TError): ApplicationError => ApplicationError.getError(opts);

export const isApplicationError = (error: unknown): error is ApplicationError => {
  return error instanceof Error && typeof (error as AnyType).statusCode === 'number';
};
