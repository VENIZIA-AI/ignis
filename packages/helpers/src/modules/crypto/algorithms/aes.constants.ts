import type { TConstValue } from '@/common/types';

/** The ciphers `AES` supports. */
export class AESAlgorithms {
  static readonly AES_256_CBC = 'aes-256-cbc';
  static readonly AES_256_GCM = 'aes-256-gcm';

  static readonly SCHEME_SET = new Set<string>([this.AES_256_CBC, this.AES_256_GCM]);

  static isValid(value: string): boolean {
    return this.SCHEME_SET.has(value);
  }
}

/** Valid AES algorithm values. */
export type AESAlgorithmType = TConstValue<typeof AESAlgorithms>;
