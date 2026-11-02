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

export { AbstractCryptoAlgorithm } from './abstract.algorithm';

const MAXIMUM_KDF_ITERATIONS = 2 ** 31 - 1;

/** The Web Crypto name of each digest `DEFAULT_KDF_DIGEST` may hold. */
const KDF_HASH_NAMES: Record<string, string> = { sha256: 'SHA-256' };

/** One entry per derivation. It holds the promise, so callers that arrive while it runs share it. */
const DERIVED_KEY_CACHE = new Map<string, Promise<Buffer>>();

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
    const cacheKey = `${DEFAULT_KDF_DIGEST}:${iterations}:${length}:${salt}:${secret}`;

    return this.deriveOnce({
      cacheKey,
      derive: () => this.derivePbkdf2({ secret, salt, iterations, length }),
    });
  }

  /** Runs `derive` once per `cacheKey`. A failed derivation leaves nothing behind, so the next call tries again. */
  private deriveOnce(opts: { cacheKey: string; derive: () => Promise<Buffer> }): Promise<Buffer> {
    const { cacheKey, derive } = opts;
    const pending = DERIVED_KEY_CACHE.get(cacheKey);

    if (pending) {
      return pending;
    }

    const derived = derive();
    DERIVED_KEY_CACHE.set(cacheKey, derived);
    derived.catch(() => {
      if (DERIVED_KEY_CACHE.get(cacheKey) === derived) {
        DERIVED_KEY_CACHE.delete(cacheKey);
      }
    });

    return derived;
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
