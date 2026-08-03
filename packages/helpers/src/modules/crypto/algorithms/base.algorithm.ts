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

  normalizeSecretKey(opts: { secret: string; length: number }): Buffer {
    const { secret, length } = opts;

    const cacheKey = `${DEFAULT_KDF_DIGEST}:${DEFAULT_KDF_ITERATIONS}:${length}:${secret}`;
    const cached = DERIVED_KEY_CACHE.get(cacheKey);
    if (cached) {
      return cached;
    }

    const key = C.pbkdf2Sync(
      secret,
      DEFAULT_KDF_SALT,
      DEFAULT_KDF_ITERATIONS,
      length,
      DEFAULT_KDF_DIGEST,
    );
    DERIVED_KEY_CACHE.set(cacheKey, key);
    return key;
  }

  getAlgorithmKeySize() {
    const b = int(this.algorithm?.split('-')?.[1] ?? DEFAULT_CIPHER_BITS);
    return int(b / 8);
  }
}
