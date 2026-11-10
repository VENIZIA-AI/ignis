import { HTTP } from '@/common/constants';
import { BaseHelper } from '../base';
import { getError } from '../error';
import {
  DEFAULT_TOKEN_BYTES,
  MIN_TOKEN_BYTES,
  UidAlphabets,
  UidCaseForms,
  UidTokenEncodings,
} from './common/constants';
import type { TUidTokenEncoding } from './common/constants';
import { Crc32 } from './common/crc32';
import { UidRandom } from './common/random';
import { UidSegments } from './common/segments';
import type { INextTokenUidOptions, ITokenUidOptions } from './common/types';

const BASE64URL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const HEX_ALPHABET = '0123456789abcdef';

const BITS_PER_BYTE = 8;
const HEX_RADIX = 16;

/** 62^6 is more than 2^32, so six base62 characters hold any CRC-32. */
const BASE62_CHECKSUM_LENGTH = 6;
/** Eight hex characters are 32 bits. */
const HEX_CHECKSUM_LENGTH = 8;

/** Bits one BASE62 character carries. */
const BASE62_BITS_PER_CHARACTER = Math.log2(UidAlphabets.BASE62.length);

/**
 * Secret tokens: random bytes from the platform CSPRNG, written as base62 (the default), hex or
 * base64url, optionally prefixed. Use it for a secret - a verification link, an API key, a session id, a password reset.
 *
 * - STORE A HASH, not the token. A database leak then leaks nothing a caller can replay.
 * - COMPARE IN CONSTANT TIME with `Hash.equals` (`crypto/algorithms/hash.algorithm.ts`), never `===`.
 * - Use `OpaqueUidHelper` for a short id a human reads, and `NumericUidHelper` for a code a human types.
 *
 * `bytes` is the entropy, not the text length: the constructor refuses anything under
 * {@link MIN_TOKEN_BYTES} (128 bits). The finished string is `prefix + delimiter + body`. A base62
 * body is `ceil(bytes * 8 / log2(62))` characters (32 bytes is 43), a hex body `bytes * 2`, a
 * base64url body `ceil(bytes * 4 / 3)`.
 *
 * `checksum: true` appends a CRC-32 of the body, so `isWellFormed` can reject a mistyped token before
 * any lookup. Enable it for a long-lived key a person copies, not for a one-shot link.
 *
 * The prefix and delimiter follow `OpaqueUidHelper`'s rules, with no `caseForm`: a token's case is
 * its encoding's. A delimiter must sit outside the encoding's characters. `_` and `-` work with
 * base62 and hex; base64url holds both, so it takes only a delimiter such as `.`.
 */
export class TokenUidHelper extends BaseHelper {
  private readonly bytes: number;
  private readonly encoding: TUidTokenEncoding;
  private readonly prefix: string;
  private readonly delimiter: string;
  private readonly checksum: boolean;

  constructor(opts?: ITokenUidOptions) {
    super({ scope: TokenUidHelper.name });

    this.bytes = opts?.bytes ?? DEFAULT_TOKEN_BYTES;

    if (!Number.isSafeInteger(this.bytes) || this.bytes < MIN_TOKEN_BYTES) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
        message: `[${TokenUidHelper.name}] bytes must be an integer of at least ${MIN_TOKEN_BYTES} | value: ${this.bytes} | Fewer bytes than that can be guessed offline`,
      });
    }

    this.encoding = opts?.encoding ?? UidTokenEncodings.BASE62;

    if (!UidTokenEncodings.isValid(this.encoding)) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
        message: `[${TokenUidHelper.name}] Unknown encoding | value: ${this.encoding} | valid: ${[...UidTokenEncodings.SCHEME_SET].join(', ')}`,
      });
    }

    if (opts?.checksum !== undefined && typeof opts.checksum !== 'boolean') {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
        message: `[${TokenUidHelper.name}] checksum must be a boolean | value: ${String(opts.checksum)} | A config-derived "false" is truthy, so it is refused rather than read`,
      });
    }

    this.checksum = opts?.checksum ?? false;

    if (this.checksum && this.encoding === UidTokenEncodings.BASE64URL) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
        message: `[${TokenUidHelper.name}] checksum is not available with the '${UidTokenEncodings.BASE64URL}' encoding | It has no fixed-width alphabet for the suffix | Use \`UidTokenEncodings.BASE62\` or \`HEX\``,
      });
    }

    this.prefix = UidSegments.resolvePrefix({
      scope: TokenUidHelper.name,
      prefix: opts?.prefix,
      caseForm: UidCaseForms.MIXED,
    });
    this.delimiter = UidSegments.resolveDelimiter({
      scope: TokenUidHelper.name,
      delimiter: opts?.delimiter,
      hasPrefix: this.prefix.length > 0,
      alphabet: TokenUidHelper.alphabetOf({ encoding: this.encoding }),
      hint: `Use \`UidTokenEncodings.BASE62\` or \`HEX\`, or a delimiter outside the characters of '${this.encoding}'`,
    });
  }

  /** `prefix` replaces the configured value for this call and turns the prefix on for it; the delimiter follows its own switch. */
  nextId(opts?: INextTokenUidOptions): string {
    const head = UidSegments.resolveHead({
      scope: TokenUidHelper.name,
      override: opts?.prefix,
      prefix: this.prefix,
      delimiter: this.delimiter,
    });

    const body = this.randomBody();

    return `${head}${body}${this.checksumOf({ body })}`;
  }

  /**
   * A FORMAT filter, nothing more: does `opts.key` have the configured prefix and delimiter, the body
   * length and alphabet of the configured `bytes` and `encoding`, and (when enabled) a matching
   * checksum. Returns `false` on anything else, never throws, including for a value that is not a
   * string.
   *
   * It is NOT authentication. CRC-32 is public and forgeable, so anyone can build a token that passes.
   * A well-formed token still has to be looked up by its HASH and compared in constant time with
   * `Hash.equals`. Use this to refuse a mistyped or truncated token before spending a lookup on it.
   *
   * The head checked is the CONFIGURED prefix and delimiter (none when the instance has no prefix); a
   * token minted with a per-call prefix is checked by an instance configured with that prefix.
   */
  isWellFormed(opts: { key: string }): boolean {
    const token = opts?.key;

    if (typeof token !== 'string') {
      return false;
    }

    const head = UidSegments.resolveHead({
      scope: TokenUidHelper.name,
      prefix: this.prefix,
      delimiter: this.delimiter,
    });

    if (!token.startsWith(head)) {
      return false;
    }

    const rest = token.slice(head.length);
    const bodyLength = this.bodyLength();

    if (rest.length !== bodyLength + this.checksumLength()) {
      return false;
    }

    const body = rest.slice(0, bodyLength);
    const alphabet = TokenUidHelper.alphabetOf({ encoding: this.encoding });

    for (const character of rest) {
      if (!alphabet.includes(character)) {
        return false;
      }
    }

    return rest.slice(bodyLength) === this.checksumOf({ body });
  }

  private bodyLength(): number {
    switch (this.encoding) {
      case UidTokenEncodings.HEX: {
        return this.bytes * 2;
      }
      case UidTokenEncodings.BASE64URL: {
        return Math.ceil((this.bytes * 4) / 3);
      }
      default: {
        return Math.ceil((this.bytes * BITS_PER_BYTE) / BASE62_BITS_PER_CHARACTER);
      }
    }
  }

  private checksumLength(): number {
    if (!this.checksum) {
      return 0;
    }

    return this.encoding === UidTokenEncodings.HEX ? HEX_CHECKSUM_LENGTH : BASE62_CHECKSUM_LENGTH;
  }

  /** The suffix for `body`: empty when the checksum is off, otherwise the CRC-32 of the body in the token's own alphabet, left-padded to a fixed width. */
  private checksumOf(opts: { body: string }): string {
    if (!this.checksum) {
      return '';
    }

    let remaining = Crc32.of({ text: opts.body });

    if (this.encoding === UidTokenEncodings.HEX) {
      return remaining.toString(HEX_RADIX).padStart(HEX_CHECKSUM_LENGTH, '0');
    }

    const base = UidAlphabets.BASE62.length;
    let text = '';

    while (remaining > 0) {
      text = UidAlphabets.BASE62[remaining % base] + text;
      remaining = Math.floor(remaining / base);
    }

    return text.padStart(BASE62_CHECKSUM_LENGTH, UidAlphabets.BASE62[0]);
  }

  private static alphabetOf(opts: { encoding: TUidTokenEncoding }): string {
    switch (opts.encoding) {
      case UidTokenEncodings.HEX: {
        return HEX_ALPHABET;
      }
      case UidTokenEncodings.BASE64URL: {
        return BASE64URL_ALPHABET;
      }
      default: {
        return UidAlphabets.BASE62;
      }
    }
  }

  private randomBody(): string {
    if (this.encoding === UidTokenEncodings.BASE62) {
      // Sampled, not encoded: 62 is not a power of two, so a base conversion of the bytes would be biased.
      return UidRandom.sample({ alphabet: UidAlphabets.BASE62, length: this.bodyLength() });
    }

    return TokenUidHelper.encode({
      bytes: UidRandom.bytes({ count: this.bytes }),
      encoding: this.encoding,
    });
  }

  /** Hand-written, not `Buffer`: this module ships to a browser, where `Buffer` does not exist. */
  private static encode(opts: { bytes: Uint8Array; encoding: TUidTokenEncoding }): string {
    const { bytes, encoding } = opts;

    if (encoding === UidTokenEncodings.HEX) {
      let hex = '';

      for (const byte of bytes) {
        hex += HEX_ALPHABET[byte >> 4] + HEX_ALPHABET[byte & 0x0f];
      }

      return hex;
    }

    // Three bytes are 24 bits, which is four 6-bit characters. A last group of one or two bytes
    // gives two or three characters, and the `=` padding is left off.
    let text = '';

    for (let index = 0; index < bytes.length; index += 3) {
      const chunk = (bytes[index] << 16) | ((bytes[index + 1] ?? 0) << 8) | (bytes[index + 2] ?? 0);
      const remaining = bytes.length - index;

      text += BASE64URL_ALPHABET[(chunk >> 18) & 0x3f] + BASE64URL_ALPHABET[(chunk >> 12) & 0x3f];

      if (remaining > 1) {
        text += BASE64URL_ALPHABET[(chunk >> 6) & 0x3f];
      }

      if (remaining > 2) {
        text += BASE64URL_ALPHABET[chunk & 0x3f];
      }
    }

    return text;
  }
}
