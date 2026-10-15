import { TNullable } from '@/common/types';
import { omit } from '@/common/utilities';
import { MessageCode } from './message-code';
import { MessageTemplate } from './message-template';
import type { TError, TErrorLogLevel, TErrorNormalized, TResponsedError } from './common';

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
  'logLevel',
  'name',
] as const;

export class ApplicationError extends Error {
  statusCode: number;
  normalized: TErrorNormalized;
  extra?: Record<string, unknown>;
  readonly logLevel?: TErrorLogLevel;

  constructor(opts: TError) {
    const { statusCode, messageArgs, cause, extra, transform, logLevel } = opts;

    // Index signature defeats `in` narrowing - read the discriminant and cast.
    const definition = 'error' in opts ? opts.error : undefined;

    const input = opts.message;
    const override = typeof input === 'string' ? { text: input } : input;

    // `?.message?.` has to guard BOTH: `error` reaches here from an untyped call site as anything at all, and a bare `definition?.message.text` throws on a malformed one.
    const message = override?.text ?? definition?.message?.text ?? '';
    const messageCode = MessageCode.resolve(
      override?.code ?? definition?.message?.code ?? (opts.messageCode as TNullable<string>),
    );
    const args = override?.args ?? messageArgs ?? definition?.message?.args;

    super(message, cause === undefined ? undefined : { cause });

    this.statusCode = statusCode ?? definition?.statusCode ?? 400;
    this.logLevel = logLevel;

    // Explicit `extra` wins over swept keys.
    const merged = {
      ...omit({ source: opts, keys: KNOWN_KEYS }),
      ...extra,
    };
    this.extra = Object.keys(merged).length > 0 ? merged : undefined;

    const normalized: TErrorNormalized = {
      text: message,
      code: messageCode,
      args: args ?? {},
    };

    this.normalized = transform
      ? transform({
          message: normalized,
          statusCode: this.statusCode,
          extra: this.extra,
        })
      : normalized;
  }

  /**
   * The message with its args filled in: `Only 2 left of TRA-01`. `message` itself stays the template,
   * so a log or an error tracker never prints a value outside the args it redacts by key - call this
   * where a plain reader stores or shows the text, such as a queue's failure reason.
   */
  toFilledText(): string {
    return MessageTemplate.render({ text: this.message, args: this.normalized.args }).text;
  }

  static getError(opts: TError) {
    return new ApplicationError(opts);
  }

  static fromError(opts: { error: TResponsedError }): ApplicationError {
    const { error } = opts;

    return this.getError({
      message: {
        text: error.normalized?.text ?? error.message ?? '',
        code: error.normalized?.code,
        args: error.normalized?.args,
      },
      statusCode: error.statusCode,
      extra: error.extra,
      ...(error.requestId === undefined ? {} : { requestId: error.requestId }),
    });
  }
}

export const getError = (opts: TError): ApplicationError => ApplicationError.getError(opts);

export const fromError = (opts: { error: TResponsedError }): ApplicationError =>
  ApplicationError.fromError(opts);

/**
 * An `ApplicationError` by shape - a numeric `statusCode` and a `normalized` with its `text` - so it
 * holds across the CJS and ESM copies of this class, where `instanceof` does not. A plain `Error`
 * that merely carries a `statusCode` (an HTTP client's, an engine's) is not one.
 *
 * An error from a copy older than 0.2.2-0 matches but has no `toFilledText()`.
 */
export const isApplicationError = (error: unknown): error is ApplicationError => {
  if (!(error instanceof Error) || !('statusCode' in error) || !('normalized' in error)) {
    return false;
  }

  const { statusCode, normalized } = error;
  return (
    typeof statusCode === 'number' &&
    typeof normalized === 'object' &&
    normalized !== null &&
    'text' in normalized &&
    typeof normalized.text === 'string'
  );
};

export type TApplicationError = ApplicationError;
