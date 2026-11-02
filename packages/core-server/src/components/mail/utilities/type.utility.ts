import type { AnyType } from '@venizia/ignis-helpers/common';
import type { IMailTransport, TMailOptions } from '../common';

/**
 * Type guards for the mail component. Each takes its value as a positional parameter, not an options
 * object (V-C-02): a type predicate narrows its own parameter, so `{ value }` could not narrow the
 * caller's variable.
 */
export class MailTypeUtility {
  /** Whether `value` is a transport: `send` and `verify` are functions, and `close` is a function or absent. */
  static isTransport(value: AnyType): value is IMailTransport {
    if (!value || typeof value !== 'object') {
      return false;
    }

    const transport = value as Record<string, unknown>;

    if (typeof transport.send !== 'function') {
      return false;
    }

    if (typeof transport.verify !== 'function') {
      return false;
    }

    if (transport.close !== undefined && typeof transport.close !== 'function') {
      return false;
    }

    return true;
  }

  /** Whether `options` has a string `provider` and a truthy `config`; the shape of `config` is not checked. */
  static isValidOptions(options: AnyType): options is TMailOptions {
    if (!options || typeof options !== 'object') {
      return false;
    }

    const opts = options as Record<string, unknown>;

    if (typeof opts.provider !== 'string') {
      return false;
    }

    if (!opts.config) {
      return false;
    }

    return true;
  }
}
