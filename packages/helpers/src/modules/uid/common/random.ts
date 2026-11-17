import { HTTP } from '@/common/constants';
import { getError } from '../../error';

/**
 * The one place the `uid` module draws randomness. Internal: not exported from the barrel, so it is
 * not API. Every helper here (`OpaqueUidHelper`, `TokenUidHelper`, `NumericUidHelper`) draws through it, which is
 * what keeps `Math.random` out of an identifier.
 */
export class UidRandom {
  /** `crypto.getRandomValues` refuses more than this per call (a browser throws `QuotaExceededError`). */
  private static readonly MAX_BYTES_PER_CALL = 65_536;

  /** `crypto.randomInt` draws a 48-bit value; `below` keeps the same width, so `max` goes up to 2 ** 48. */
  private static readonly DRAW_BYTES = 6;
  private static readonly BYTE_RANGE = 256;

  /** The largest `max` {@link UidRandom.below} accepts. */
  static readonly MAX_BELOW = 2 ** (UidRandom.DRAW_BYTES * 8);

  /**
   * `crypto.getRandomValues`, never `Math.random`. Unlike `crypto.randomUUID`, this one is NOT
   * restricted to a secure context, so it works on a plain-http origin and inside a browser Worker.
   * Throws when Web Crypto is missing instead of falling back to something weaker.
   */
  static bytes(opts: { count: number }): Uint8Array {
    const source = globalThis.crypto;

    if (typeof source?.getRandomValues !== 'function') {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
        message: `[${UidRandom.name}] No Web Crypto available | \`crypto.getRandomValues\` is required and \`Math.random\` is not an acceptable substitute for an identifier`,
      });
    }

    const result = new Uint8Array(opts.count);

    for (let offset = 0; offset < opts.count; offset += UidRandom.MAX_BYTES_PER_CALL) {
      source.getRandomValues(
        result.subarray(offset, Math.min(offset + UidRandom.MAX_BYTES_PER_CALL, opts.count)),
      );
    }

    return result;
  }

  /** How many random bytes to draw per refill, per remaining character. Rejection throws some away, so asking for exactly `length` would round-trip to the entropy source repeatedly. */
  private static readonly SAMPLING_OVERDRAW = 2;

  /**
   * `length` characters of `alphabet`, each equally likely. A draw is masked to the smallest
   * `2^n - 1` that covers every alphabet index and an index past the alphabet is discarded, because
   * a plain `byte % size` would favour the first `256 % size` characters - a bias a caller cannot see
   * and cannot undo.
   */
  static sample(opts: { alphabet: string; length: number }): string {
    const { alphabet, length } = opts;
    const size = alphabet.length;
    const mask = (1 << Math.ceil(Math.log2(size))) - 1;
    let body = '';

    while (body.length < length) {
      const bytes = UidRandom.bytes({
        count: (length - body.length) * UidRandom.SAMPLING_OVERDRAW,
      });

      for (const byte of bytes) {
        const index = byte & mask;

        if (index >= size) {
          continue;
        }

        body += alphabet[index];

        if (body.length === length) {
          break;
        }
      }
    }

    return body;
  }

  /** Whether `max` is a usable bound for {@link UidRandom.below}: an integer from 1 to {@link UidRandom.MAX_BELOW}. */
  static isValidMax(opts: { max: number }): boolean {
    const { max } = opts;

    return Number.isSafeInteger(max) && max > 0 && max <= UidRandom.MAX_BELOW;
  }

  /**
   * A uniform integer in `[0, max)`. A draw at or above the largest multiple of `max` is thrown away
   * and drawn again, so no value is likelier than another (`value % max` alone favours the low ones).
   */
  static below(opts: { max: number }): number {
    const { max } = opts;

    if (!UidRandom.isValidMax({ max })) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
        message: `[${UidRandom.name}][below] Invalid max | must be an integer from 1 to ${UidRandom.MAX_BELOW} | Got: ${max}`,
      });
    }

    const limit = UidRandom.MAX_BELOW - (UidRandom.MAX_BELOW % max);

    for (;;) {
      let value = 0;

      for (const byte of UidRandom.bytes({ count: UidRandom.DRAW_BYTES })) {
        value = value * UidRandom.BYTE_RANGE + byte;
      }

      if (value < limit) {
        return value % max;
      }
    }
  }
}
