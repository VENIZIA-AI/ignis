import C from 'node:crypto';
import { BaseHelper } from '@/modules/base';
import { getError } from '@/modules/error';
import { int } from '@/utilities';
import {
  DEFAULT_CIPHER_BITS,
  DEFAULT_KDF_DIGEST,
  DEFAULT_KDF_ITERATIONS,
  DEFAULT_KDF_SALT,
  ICryptoAlgorithm,
  MINIMUM_KDF_SALT_BYTES,
} from '../common';

const DERIVED_KEY_CACHE = new Map<string, Buffer>();

export abstract class AbstractCryptoAlgorithm<
  AlgorithmType extends string,
  EncryptInputType = unknown,
  DecryptInputType = unknown,
  SecretKeyType = unknown,
  EncryptReturnType = unknown,
  DecryptReturnType = unknown,
  ExtraOptions = unknown,
>
  extends BaseHelper
  implements
    ICryptoAlgorithm<
      AlgorithmType,
      EncryptInputType,
      DecryptInputType,
      SecretKeyType,
      EncryptReturnType,
      DecryptReturnType,
      ExtraOptions
    >
{
  algorithm: AlgorithmType;

  abstract encrypt(opts: {
    message: EncryptInputType;
    secret: SecretKeyType;
    opts?: ExtraOptions;
  }): EncryptReturnType;

  abstract decrypt(opts: {
    message: DecryptInputType;
    secret: SecretKeyType;
    opts?: ExtraOptions;
  }): DecryptReturnType;
}

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

  /** Omit `kdfSalt`/`kdfIterations` for the shipped default (byte-identical to every prior release). Supplying either requires supplying the same value again on decrypt. */
  normalizeSecretKey(opts: {
    secret: string;
    length: number;
    kdfSalt?: string;
    kdfIterations?: number;
  }): Buffer {
    const { secret, length, kdfSalt, kdfIterations } = opts;

    if (kdfSalt !== undefined) {
      this.validateKdfSalt({ kdfSalt });
    }

    const salt = kdfSalt ?? DEFAULT_KDF_SALT;
    const iterations = kdfIterations ?? DEFAULT_KDF_ITERATIONS;

    const cacheKey = `${DEFAULT_KDF_DIGEST}:${iterations}:${length}:${salt}:${secret}`;
    const cached = DERIVED_KEY_CACHE.get(cacheKey);
    if (cached) {
      return cached;
    }

    const key = C.pbkdf2Sync(secret, salt, iterations, length, DEFAULT_KDF_DIGEST);
    DERIVED_KEY_CACHE.set(cacheKey, key);
    return key;
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
    const b = int(this.algorithm?.split('-')?.[1] ?? DEFAULT_CIPHER_BITS);
    return int(b / 8);
  }
}
