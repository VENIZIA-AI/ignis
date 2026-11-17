import type { IMailTransport, TMailOptions } from '../common';

/**
 * Type guards for the mail component. Each takes its value as a positional parameter, not an options
 * object (V-C-02): a type predicate narrows its own parameter, so `{ value }` could not narrow the
 * caller's variable.
 */
export class MailTypeUtility {
  /** Whether `value` is a transport: `send` and `verify` are functions, and `close` is a function or absent. */
  static isTransport(value: unknown): value is IMailTransport {
    if (!value || typeof value !== 'object') {
      return false;
    }

    if (typeof Reflect.get(value, 'send') !== 'function') {
      return false;
    }

    if (typeof Reflect.get(value, 'verify') !== 'function') {
      return false;
    }

    const close: unknown = Reflect.get(value, 'close');

    if (close !== undefined && typeof close !== 'function') {
      return false;
    }

    return true;
  }

  /** Whether `options` has a string `provider` and a truthy `config`; the shape of `config` is not checked. */
  static isValidOptions(options: unknown): options is TMailOptions {
    if (!options || typeof options !== 'object') {
      return false;
    }

    if (typeof Reflect.get(options, 'provider') !== 'string') {
      return false;
    }

    if (!Reflect.get(options, 'config')) {
      return false;
    }

    return true;
  }
}
