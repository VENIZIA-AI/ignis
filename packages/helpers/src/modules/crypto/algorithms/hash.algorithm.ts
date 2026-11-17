import crypto from 'node:crypto';

import { BaseHelper } from '@/modules/base';
import { getError } from '@/modules/error';
import {
  DEFAULT_HASH_OUTPUT_ENCODING,
  HashAlgorithms,
  type THashAlgorithm,
  type THashOutputEncoding,
} from '../common';

interface IHashExtraOptions {
  outputEncoding?: THashOutputEncoding;
}

/** Text is hashed as UTF-8, bytes as they are. */
type THashInput = string | Uint8Array;

/**
 * One-way message digests and keyed HMACs. Unlike `AES`/`RSA` this has no `decrypt` - a digest
 * cannot be reversed, so `digest`/`hmac` are the only operations, not `ICryptoAlgorithm`.
 */
export class Hash extends BaseHelper {
  algorithm: THashAlgorithm;

  constructor(opts: { algorithm: THashAlgorithm }) {
    super({ scope: Hash.name, identifier: opts.algorithm });
    this.validateAlgorithmName({ algorithm: opts.algorithm });

    this.algorithm = opts.algorithm;
  }

  /** Memoized - `BaseHelper`'s constructor resolves a logger on every allocation (~50ns), and downstream token code calls `withAlgorithm` per request. */
  private static readonly instances = new Map<THashAlgorithm, Hash>();

  static withAlgorithm(algorithm: THashAlgorithm) {
    const cached = Hash.instances.get(algorithm);

    if (cached) {
      return cached;
    }

    const created = new Hash({ algorithm });
    Hash.instances.set(algorithm, created);

    return created;
  }

  validateAlgorithmName(opts: { algorithm: THashAlgorithm }) {
    const { algorithm } = opts;

    if (!algorithm || !HashAlgorithms.isValid(algorithm)) {
      throw getError({
        message: `[Hash][validateAlgorithmName] Invalid algorithm name | algorithm: ${algorithm}`,
      });
    }
  }

  /**
   * Plain digest, no secret. `message` is text (UTF-8), bytes, or several parts hashed in order as ONE message: a git
   * blob is the header text "blob <size>" and a NUL byte, then the bytes, so its parts are the header and the bytes. MD5/SHA1
   * are broken/weak - see {@link HashAlgorithms} - never use for security decisions.
   */
  digest(opts: {
    message: THashInput | ReadonlyArray<THashInput>;
    opts?: IHashExtraOptions;
  }): string {
    const { message } = opts;
    const { outputEncoding = DEFAULT_HASH_OUTPUT_ENCODING } = opts.opts ?? {};
    const hash = new Bun.CryptoHasher(this.algorithm);

    for (const part of Array.isArray(message) ? message : [message]) {
      hash.update(part);
    }

    return hash.digest(outputEncoding);
  }

  /**
   * Keyed HMAC. `message` and `secret` are text (UTF-8) or bytes: a `Buffer` or `Uint8Array` key gives the same output
   * as the text of the same bytes, so a token printed with one keeps verifying with the other. `secret` is mandatory and
   * validated non-empty so a request for an HMAC never silently degrades into an unkeyed digest.
   */
  hmac(opts: { message: THashInput; secret: THashInput; opts?: IHashExtraOptions }): string {
    const { message, secret } = opts;
    const { outputEncoding = DEFAULT_HASH_OUTPUT_ENCODING } = opts.opts ?? {};

    if (secret.length === 0) {
      throw getError({
        message: `[Hash][hmac] Missing secret for HMAC-${this.algorithm.toUpperCase()}`,
      });
    }

    return new Bun.CryptoHasher(this.algorithm, secret).update(message).digest(outputEncoding);
  }

  /**
   * Compares two strings exactly as given, in constant time: the byte length first, then `crypto.timingSafeEqual`. For
   * two digests that are both already in hand, such as an idempotency fingerprint against a saved one, where
   * {@link Hash.verify} has nothing to hash. `false` for any difference, never a throw, and `false` too for a value that
   * is not a string. Two empty strings are equal. The text is compared, not the bytes it stands for: hex in upper case
   * does not equal hex in lower case.
   */
  static equals(opts: { value: string; expected: string }): boolean {
    const { value, expected } = opts;

    if (typeof value !== 'string' || typeof expected !== 'string') {
      return false;
    }

    const left = Buffer.from(value);
    const right = Buffer.from(expected);

    // Length-checked first: `timingSafeEqual` throws on a length mismatch instead of answering false.
    return left.length === right.length && crypto.timingSafeEqual(left, right);
  }

  /**
   * Checks a received digest against the one `value` produces, in constant time. Use it for a webhook signature or a
   * payment callback instead of `===`, which stops at the first differing character and so tells an attacker how many
   * leading characters of a forged value were right.
   *
   * `value` is hashed the way {@link Hash.digest} does, or keyed with `secret` the way {@link Hash.hmac} does, then
   * written in `outputEncoding` (hex by default) and compared with `expected` by {@link Hash.equals}. A different length
   * answers `false` without comparing, and the answer is `false`, never a throw, for any mismatch. `expected` is exact
   * text: hex in upper case does not equal hex in lower case, and an unpadded or URL-safe form of the same base64 digest
   * is refused. Pass the matching `outputEncoding` (`base64url`), or normalise the text first.
   */
  verify(opts: {
    value: THashInput;
    expected: string;
    secret?: THashInput;
    opts?: IHashExtraOptions;
  }): boolean {
    const { value, expected, secret } = opts;
    const computed =
      secret === undefined
        ? this.digest({ message: value, opts: opts.opts })
        : this.hmac({ message: value, secret, opts: opts.opts });

    return Hash.equals({ value: computed, expected });
  }
}
