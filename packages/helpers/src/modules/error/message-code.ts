import { getError } from './app-error';

export class MessageCode {
  static readonly SEPARATOR = '.';
  static readonly SEGMENT_PATTERN = /^[a-z0-9]+(_[a-z0-9]+)*$/;
  static readonly MIN_SEGMENTS = 2;
  static readonly DEFAULT = 'core.system_error';

  /**
   * Builds a code from its segments. Throws on a malformed one - codes are declared at module scope,
   * so a bad code fails the process at import instead of shipping dead into production.
   */
  static build(opts: { parts: Array<string> }): string {
    const { parts } = opts;

    if (parts.length < this.MIN_SEGMENTS) {
      throw getError({
        messageCode: 'core.message_code.invalid_segment_count',
        message: `[MessageCode][build] A code needs at least ${this.MIN_SEGMENTS} segments (namespace + reason) | Got: ${JSON.stringify(parts)}`,
      });
    }

    for (const segment of parts) {
      if (!this.SEGMENT_PATTERN.test(segment)) {
        throw getError({
          messageCode: 'core.message_code.invalid_segment_format',
          message: `[MessageCode][build] Invalid segment '${segment}' | Expected lower snake_case (a-z, 0-9, '_') | Full: ${JSON.stringify(parts)}`,
        });
      }
    }

    return parts.join(this.SEPARATOR).toLowerCase();
  }

  /** True when `code` is well-formed. Cheap guard for a code that arrives from outside. */
  static isValid(code: string): boolean {
    const segments = code.split(this.SEPARATOR);

    return (
      segments.length >= this.MIN_SEGMENTS &&
      segments.every(segment => this.SEGMENT_PATTERN.test(segment))
    );
  }

  /** Normalizes an absent or empty code to {@link DEFAULT} - an empty string is not a code. */
  static resolve(code?: string): string {
    return code?.length ? code.toLowerCase() : this.DEFAULT.toLowerCase();
  }
}
