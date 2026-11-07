import { type TNullable } from '@/common/types';
import { ObjectUtility } from '@/common/utilities';
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

/** The HTTP error range: a wrapped value's own status counts only inside it, so a stray 200 or 0 never becomes the response status. */
const MIN_WRAPPED_STATUS = 400;
const MAX_WRAPPED_STATUS = 599;
const DEFAULT_WRAPPED_STATUS = 500;

/** Fixed text for a value that carries no message; the value itself is never printed, it only rides as the cause. */
const UNKNOWN_VALUE_MESSAGE = 'An unknown value was thrown';

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

/** The error type the framework throws; `normalized` holds the resolved text, code and args a client renders. */
export class ApplicationError extends Error {
  /** @default 400 */
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
      ...ObjectUtility.omit({ source: opts, keys: KNOWN_KEYS }),
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

  /** One property read that cannot throw: a getter or a Proxy trap that throws reads as absent. */
  private static readProperty(opts: { value: unknown; key: string }): unknown {
    const { value, key } = opts;

    // A primitive holds no own data; `null` is the one object that cannot be read.
    if ((typeof value !== 'object' && typeof value !== 'function') || value === null) {
      return undefined;
    }

    try {
      return Reflect.get(value, key);
      // eslint-disable-next-line venizia/no-silent-catch -- the contract is "never throws": a throwing getter or Proxy trap reads as absent
    } catch {
      return undefined;
    }
  }

  /** The first of `statusCode` (what `getError` sets) and `status` (Hono's `HTTPException`) that is an integer in 400-599; else 500. */
  private static readWrappedStatus(opts: { value: unknown }): number {
    const { value } = opts;

    for (const key of ['statusCode', 'status']) {
      const candidate = ApplicationError.readProperty({ value, key });

      if (
        typeof candidate === 'number' &&
        Number.isInteger(candidate) &&
        candidate >= MIN_WRAPPED_STATUS &&
        candidate <= MAX_WRAPPED_STATUS
      ) {
        return candidate;
      }
    }

    return DEFAULT_WRAPPED_STATUS;
  }

  /** The value's own string `message` on one line (every control character escaped, as a log line must not break), else the fixed text. */
  private static readWrappedMessage(opts: { value: unknown }): string {
    const message = ApplicationError.readProperty({ value: opts.value, key: 'message' });

    if (typeof message !== 'string' || message.trim().length === 0) {
      return UNKNOWN_VALUE_MESSAGE;
    }

    let safe = '';
    let copiedUpTo = 0;

    for (let index = 0; index < message.length; index++) {
      const code = message.charCodeAt(index);
      const isUnsafe =
        code < 0x20 || (code >= 0x7f && code <= 0x9f) || code === 0x2028 || code === 0x2029;

      if (!isUnsafe) {
        continue;
      }

      safe += `${message.slice(copiedUpTo, index)}\\u${code.toString(16).padStart(4, '0')}`;
      copiedUpTo = index + 1;
    }

    return copiedUpTo === 0 ? message : safe + message.slice(copiedUpTo);
  }

  /**
   * The `ApplicationError` for a caught value of any type: the same instance when it already is one
   * (`isApplicationError` shape, so an error from another copy of the class counts), else a new one
   * with the original as `cause`. Never throws, whatever the value.
   *
   * The new error takes its `statusCode` from the value's `statusCode`, then `status`, when that is an integer
   * in 400-599 (else 500), and its message from a string `message` (else a fixed text). That message reaches the
   * client as written, unlike an unexpected error's, so wrap only what its caller may show.
   */
  static fromUnknown(opts: { error: unknown }): ApplicationError {
    const { error } = opts;

    try {
      if (error instanceof ApplicationError || isApplicationError(error)) {
        return error;
      }
      // eslint-disable-next-line venizia/no-silent-catch -- a Proxy or hostile getter threw while the shape was checked: it is foreign, so it is wrapped below
    } catch {
      // Falls through to the wrap.
    }

    return ApplicationError.getError({
      message: ApplicationError.readWrappedMessage({ value: error }),
      statusCode: ApplicationError.readWrappedStatus({ value: error }),
      cause: error,
    });
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

/** Builds an `ApplicationError`; same as `ApplicationError.getError`. */
export const getError = (opts: TError): ApplicationError => ApplicationError.getError(opts);

/** Rebuilds an `ApplicationError` from the wire payload a client received; same as `ApplicationError.fromError`. */
export const fromError = (opts: { error: TResponsedError }): ApplicationError =>
  ApplicationError.fromError(opts);
