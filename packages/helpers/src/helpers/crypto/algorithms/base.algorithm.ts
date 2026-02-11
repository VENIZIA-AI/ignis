import { BaseHelper } from '@/helpers/base';
import { getError } from '@/helpers/error';
import { int } from '@/utilities';
import { DEFAULT_CIPHER_BITS, DEFAULT_PAD_END, ICryptoAlgorithm } from '../common';

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

  normalizeSecretKey(opts: { secret: string; length: number; padEnd?: string }) {
    const { secret, length, padEnd = DEFAULT_PAD_END } = opts;

    if (secret.length > length) {
      return secret.slice(0, length);
    }

    return secret.padEnd(length, padEnd);
  }

  getAlgorithmKeySize() {
    const b = int(this.algorithm?.split('-')?.[1] ?? DEFAULT_CIPHER_BITS);
    return int(b / 8);
  }
}
