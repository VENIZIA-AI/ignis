export const DEFAULT_CIPHER_BITS = 256;

/**
 * Legacy padEnd key-stretching char. No longer used for key derivation —
 * keys are now derived via PBKDF2 (see `DEFAULT_KDF_*`). Kept only so existing imports
 * do not break.
 */
export const DEFAULT_PAD_END = (0x00).toString();

export const DEFAULT_KDF_SALT = 'ignis-kdf-salt-v1';
export const DEFAULT_KDF_ITERATIONS = 100_000;
export const DEFAULT_KDF_DIGEST = 'sha256';
