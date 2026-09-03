import type { TConstValue } from '@/common';

export const DEFAULT_CIPHER_BITS = 256;

/** Legacy padEnd key-stretching char, no longer used - keys now derive via PBKDF2 (`DEFAULT_KDF_*`). Kept only so existing imports do not break. */
export const DEFAULT_PAD_END = (0x00).toString();

/**
 * Public and identical across every deployment, so it stops a bare dictionary attack but not a
 * table precomputed against this value - pass `kdfSalt` for per-deployment isolation. Never
 * change this: every ciphertext already encrypted under it becomes undecryptable.
 */
export const DEFAULT_KDF_SALT = 'ignis-kdf-salt-v1';
export const DEFAULT_KDF_ITERATIONS = 100_000;
export const DEFAULT_KDF_DIGEST = 'sha256';

/** NIST SP 800-132 minimum recommended salt size (128 bits) for a caller-supplied `kdfSalt`. */
export const MINIMUM_KDF_SALT_BYTES = 16;

/** NIST SP 800-57 Part 1 floor for RSA past 2030. */
export const MINIMUM_RSA_MODULUS_BITS = 2048;

export class HashAlgorithms {
  /** Cryptographically broken - kept only for wire-protocol compatibility (VNPay checksums); never use for security decisions. */
  static readonly MD5 = 'md5';

  /** Cryptographically weak - kept for wire-protocol compatibility with legacy integrations; never use for security decisions. */
  static readonly SHA1 = 'sha1';

  static readonly SHA256 = 'sha256';
  static readonly SHA384 = 'sha384';
  static readonly SHA512 = 'sha512';

  static readonly SCHEME_SET = new Set<string>([
    this.MD5,
    this.SHA1,
    this.SHA256,
    this.SHA384,
    this.SHA512,
  ]);

  static isValid(value: string): value is THashAlgorithm {
    return this.SCHEME_SET.has(value);
  }
}

export type THashAlgorithm = TConstValue<typeof HashAlgorithms>;

export class HashOutputEncodings {
  static readonly HEX = 'hex';
  static readonly BASE64 = 'base64';
  static readonly BASE64URL = 'base64url';

  static readonly SCHEME_SET = new Set<string>([this.HEX, this.BASE64, this.BASE64URL]);

  static isValid(value: string): value is THashOutputEncoding {
    return this.SCHEME_SET.has(value);
  }
}

export type THashOutputEncoding = TConstValue<typeof HashOutputEncodings>;

export const DEFAULT_HASH_OUTPUT_ENCODING: THashOutputEncoding = HashOutputEncodings.HEX;
