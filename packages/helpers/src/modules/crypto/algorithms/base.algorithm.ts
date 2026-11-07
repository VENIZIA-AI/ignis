import { getError } from '@/modules/error';
import { ParseUtility } from '@/utilities';
import {
  DEFAULT_CIPHER_BITS,
  DEFAULT_KDF_DIGEST,
  DEFAULT_KDF_ITERATIONS,
  DEFAULT_KDF_SALT,
  MINIMUM_KDF_SALT_BYTES,
} from '../common';
import { AbstractCryptoAlgorithm } from './abstract.algorithm';
import { DerivedKeyCache } from './derived-key-cache';

export { AbstractCryptoAlgorithm } from './abstract.algorithm';

const MAXIMUM_KDF_ITERATIONS = 2 ** 31 - 1;

/** The Web Crypto name of each digest `DEFAULT_KDF_DIGEST` may hold. */
const KDF_HASH_NAMES: Record<string, string> = { sha256: 'SHA-256' };

/** One entry per derivation, bounded. It holds the promise, so callers that arrive while it runs share it. */
const DERIVED_KEY_CACHE = new DerivedKeyCache();

/** Base for the symmetric algorithms: validates the algorithm name and derives a key of a given length from a secret with PBKDF2. */
export abstract class BaseCryptoAlgorithm<
  AlgorithmType extends string,
  EncryptInputType = unknown,
  DecryptInputType = unknown,
  SecretKeyType = unknown,
  EncryptReturnType = unknown,
  DecryptReturnType = unknown,
  ExtraOptions = unknown,
> extends AbstractCryptoAlgorithm<
  AlgorithmType,
  EncryptInputType,
  DecryptInputType,
  SecretKeyType,
  EncryptReturnType,
  DecryptReturnType,
  ExtraOptions
> {
  /**
   * `doThrow: false` is gone: a failed encrypt or decrypt used to hand the input back, which a caller could take for
   * ciphertext or plaintext. A failure always throws. A caller that still passes the option is refused, not ignored,
   * so nobody believes it still works.
   */
  protected assertNoRemovedOptions(opts: { method: string; options?: object }): void {
    if (opts.options !== undefined && opts.options !== null && 'doThrow' in opts.options) {
      throw getError({
        message: `[${this.constructor.name}][${opts.method}] The doThrow option was removed | a failure always throws: catch the error where a fallback is wanted, and never treat the input as the result`,
      });
    }
  }

  constructor(opts: { scope: string; algorithm: AlgorithmType }) {
    super({
      scope: opts.scope ?? opts.algorithm ?? BaseCryptoAlgorithm.name,
      identifier: opts.algorithm,
    });
    this.validateAlgorithmName({ algorithm: opts.algorithm });

    this.algorithm = opts.algorithm;
  }

  validateAlgorithmName(opts: { algorithm: AlgorithmType }) {
    const { algorithm } = opts;

    if (!algorithm) {
      throw getError({
        message: `[validateAlgorithmName] Invalid algorithm name | algorithm: ${algorithm}`,
      });
    }
  }

  /**
   * Omit `kdfSalt`/`kdfIterations` for the shipped default (byte-identical to every prior release). Supplying either requires supplying the same value again on decrypt.
   * Derived with PBKDF2 over `crypto.subtle`, once per secret: a second call, even one that starts while the first runs, shares its result.
   */
  async normalizeSecretKey(opts: {
    secret: string;
    length: number;
    kdfSalt?: string;
    kdfIterations?: number;
  }): Promise<Buffer> {
    const { secret, length, kdfSalt, kdfIterations } = opts;

    if (kdfSalt !== undefined) {
      this.validateKdfSalt({ kdfSalt });
    }

    const salt = kdfSalt ?? DEFAULT_KDF_SALT;
    const iterations = kdfIterations ?? DEFAULT_KDF_ITERATIONS;

    // `pbkdf2Sync` refused anything but an integer from 1 up to 2^31 - 1; Web Crypto would round a fraction down and take up to 2^32 - 1.
    if (!Number.isInteger(iterations) || iterations < 1 || iterations > MAXIMUM_KDF_ITERATIONS) {
      throw getError({
        message: `[BaseCryptoAlgorithm][normalizeSecretKey] kdfIterations must be an integer from 1 to ${MAXIMUM_KDF_ITERATIONS}, got ${iterations}`,
      });
    }

    const key = DerivedKeyCache.keyOf({
      parts: [DEFAULT_KDF_DIGEST, iterations, length, salt, secret],
    });

    return DERIVED_KEY_CACHE.deriveOnce({
      key,
      derive: () => this.derivePbkdf2({ secret, salt, iterations, length }),
    });
  }

  private async derivePbkdf2(opts: {
    secret: string;
    salt: string;
    iterations: number;
    length: number;
  }): Promise<Buffer> {
    const { secret, salt, iterations, length } = opts;
    const hash = KDF_HASH_NAMES[DEFAULT_KDF_DIGEST];

    if (hash === undefined) {
      throw getError({
        message: `[BaseCryptoAlgorithm][derivePbkdf2] No Web Crypto name for the digest "${DEFAULT_KDF_DIGEST}"`,
      });
    }

    const encoder = new TextEncoder();
    const material = await crypto.subtle.importKey('raw', encoder.encode(secret), 'PBKDF2', false, [
      'deriveBits',
    ]);
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', hash, salt: encoder.encode(salt), iterations },
      material,
      length * 8,
    );

    return Buffer.from(bits);
  }

  /** Rejects a `kdfSalt` short enough to look configured while giving up most of the protection a salt exists for (NIST SP 800-132: 128-bit minimum). */
  private validateKdfSalt(opts: { kdfSalt: string }): void {
    const { kdfSalt } = opts;
    const byteLength = Buffer.byteLength(kdfSalt, 'utf-8');

    if (byteLength < MINIMUM_KDF_SALT_BYTES) {
      throw getError({
        message: `[BaseCryptoAlgorithm][validateKdfSalt] kdfSalt must be at least ${MINIMUM_KDF_SALT_BYTES} bytes, got ${byteLength}`,
      });
    }
  }

  getAlgorithmKeySize() {
    const b = ParseUtility.toInt({ input: this.algorithm?.split('-')?.[1] ?? DEFAULT_CIPHER_BITS });

    return ParseUtility.toInt({ input: b / 8 });
  }
}
