import { BaseHelper } from '@/modules/base';
import type { ICryptoAlgorithm } from '../common/types';

/**
 * The contract of a crypto algorithm class, with no runtime dependency beyond `BaseHelper`: no `node:*`, no
 * key derivation. It lives in its own file so a browser-pure class (`ECDH`, over `crypto.subtle`) can extend it
 * and ride `@venizia/ignis-helpers/core`. `BaseCryptoAlgorithm` (`base.algorithm.ts`, which needs
 * `Buffer`) extends it for the server algorithms (`AES`, `LegacyAES`, `RSA`).
 */
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
