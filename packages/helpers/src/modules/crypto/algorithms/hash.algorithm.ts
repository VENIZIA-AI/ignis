import C from 'node:crypto';
import { BaseHelper } from '@/modules/base';
import { getError } from '@/modules/error';
import {
  DEFAULT_HASH_OUTPUT_ENCODING,
  HashAlgorithms,
  THashAlgorithm,
  THashOutputEncoding,
} from '../common';

interface IHashExtraOptions {
  outputEncoding?: THashOutputEncoding;
}

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

  /**
   * Memoized - `BaseHelper`'s constructor resolves a logger on every allocation, measured at ~50ns,
   * paid per call by the deprecated `hash()` shim that downstream payment code calls per request.
   */
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

  /** Plain digest, no secret. MD5/SHA1 are broken/weak - see {@link HashAlgorithms} - never use for security decisions. */
  digest(opts: { message: string; opts?: IHashExtraOptions }): string {
    const { message } = opts;
    const { outputEncoding = DEFAULT_HASH_OUTPUT_ENCODING } = opts.opts ?? {};

    return C.createHash(this.algorithm).update(message).digest(outputEncoding);
  }

  /** Keyed HMAC. `secret` is mandatory and validated non-empty so a request for an HMAC never silently degrades into an unkeyed digest. */
  hmac(opts: { message: string; secret: string; opts?: IHashExtraOptions }): string {
    const { message, secret } = opts;
    const { outputEncoding = DEFAULT_HASH_OUTPUT_ENCODING } = opts.opts ?? {};

    if (!secret) {
      throw getError({
        message: `[Hash][hmac] Missing secret for HMAC-${this.algorithm.toUpperCase()}`,
      });
    }

    return C.createHmac(this.algorithm, secret).update(message).digest(outputEncoding);
  }
}
