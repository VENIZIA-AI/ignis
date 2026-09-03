import type { TNullable } from '@/common/types';
import type { TError } from './common';

type TErrorFactory = (opts: TError) => Error;

export class MessageCode {
  static readonly SEPARATOR = '.';
  static readonly SEGMENT_PATTERN = /^[a-z0-9]+(_[a-z0-9]+)*$/;
  static readonly MIN_SEGMENTS = 2;
  static readonly DEFAULT = 'core.system_error';

  // The one permitted raw `new Error`, used only until `src/index.ts` registers `getError`.
  private static errorFactory: TErrorFactory = opts =>
    new Error(typeof opts.message === 'string' ? opts.message : JSON.stringify(opts.message));

  /**
   * Registered by the package entry at module init; keeps the throws identical without a
   * static import of app-error (that import was the cycle).
   * @internal Framework wiring; consumers must not replace the factory.
   */
  static useErrorFactory(opts: { factory: TErrorFactory }): void {
    this.errorFactory = opts.factory;
  }

  /** Builds a code from its segments, throwing on a malformed one - codes are declared at module scope, so a bad code fails the process at import instead of shipping dead into production. */
  static build(opts: { parts: Array<string> }): string {
    const { parts } = opts;

    if (parts.length < this.MIN_SEGMENTS) {
      throw this.errorFactory({
        messageCode: 'core.message_code.invalid_segment_count',
        message: `[MessageCode][build] A code needs at least ${this.MIN_SEGMENTS} segments (namespace + reason) | Got: ${JSON.stringify(parts)}`,
      });
    }

    for (const segment of parts) {
      if (!this.SEGMENT_PATTERN.test(segment)) {
        throw this.errorFactory({
          messageCode: 'core.message_code.invalid_segment_format',
          message: `[MessageCode][build] Invalid segment '${segment}' | Expected lower snake_case (a-z, 0-9, '_') | Full: ${JSON.stringify(parts)}`,
        });
      }
    }

    return parts.join(this.SEPARATOR).toLowerCase();
  }

  /** True when `code` is well-formed. Takes `unknown` because it guards codes arriving from outside - a guard that throws on the very input it exists to screen is not a guard. */
  static isValid(code: unknown): boolean {
    if (typeof code !== 'string') {
      return false;
    }

    const segments = code.split(this.SEPARATOR);

    return (
      segments.length >= this.MIN_SEGMENTS &&
      segments.every(segment => this.SEGMENT_PATTERN.test(segment))
    );
  }

  /** Normalizes an absent, empty or non-string code to {@link DEFAULT}. */
  static resolve(code?: TNullable<string>): string {
    return typeof code === 'string' && code.length
      ? code.toLowerCase()
      : this.DEFAULT.toLowerCase();
  }
}
