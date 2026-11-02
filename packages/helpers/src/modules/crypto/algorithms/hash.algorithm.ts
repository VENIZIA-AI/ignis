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
}
