import type { TConstValue } from '@/common/types';
import { ConstClass } from '@/common/const-class';

/** The ciphers `AES` supports. */
export class AESAlgorithms extends ConstClass {
  static readonly AES_256_CBC = 'aes-256-cbc';
  static readonly AES_256_GCM = 'aes-256-gcm';
}

/** Valid AES algorithm values. */
export type AESAlgorithmType = TConstValue<typeof AESAlgorithms>;

/** The `usages` a key is imported for. */
export class AesKeyUsages {
  static readonly ENCRYPT = 'encrypt';
  static readonly DECRYPT = 'decrypt';
}

/** One of `AesKeyUsages`. */
export type TAesKeyUsage = TConstValue<typeof AesKeyUsages>;

/** The Web Crypto names of the two AES modes. */
export class AesCipherNames {
  static readonly CBC = 'AES-CBC';
  static readonly GCM = 'AES-GCM';
}

/** One of `AesCipherNames`. */
export type TAesCipherName = TConstValue<typeof AesCipherNames>;
