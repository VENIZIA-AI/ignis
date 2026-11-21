import type { TConstValue } from '@/common/types';
import { ConstClass } from '@/common/const-class';

/** The ciphers `AES` supports. */
export class AESAlgorithms extends ConstClass {
  static readonly AES_256_CBC = 'aes-256-cbc';
  static readonly AES_256_GCM = 'aes-256-gcm';
}

/** Valid AES algorithm values. */
export type AESAlgorithmType = TConstValue<typeof AESAlgorithms>;
