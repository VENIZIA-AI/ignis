import { getError } from '@/modules/error';
import { AESAlgorithms, type AESAlgorithmType } from './aes.constants';

const IV_BYTES = 16;
const TAG_BYTES = 16;
const TAG_BITS = TAG_BYTES * 8;

/** What `crypto.subtle` takes. Every array here is backed by an `ArrayBuffer`; none is shared memory. */
type TBytes = Uint8Array<ArrayBuffer>;

type TCipherParams =
  | { name: 'AES-CBC'; iv: TBytes }
  | { name: 'AES-GCM'; iv: TBytes; tagLength: number };

/**
 * AES-CBC and AES-GCM over `crypto.subtle`, shared by `AES` and `LegacyAES`. It keeps the layout of the
 * synchronous implementation it replaced, so what is already stored still reads: CBC pads with PKCS#7,
 * and GCM takes a 16-byte IV and a 16-byte tag. Web Crypto returns GCM output as `cipherText || tag`;
 * the stored envelopes put the tag BEFORE the cipher text, so `seal` and `open` split and join them here
 * and the callers deal in the two parts.
 */
export class AesEngine {
  static async seal(opts: {
    algorithm: AESAlgorithmType;
    key: Uint8Array;
    iv: Uint8Array;
    plain: Uint8Array;
  }): Promise<{ cipherText: Uint8Array; authTag: Uint8Array | null }> {
    const { algorithm, key, iv, plain } = opts;
    const cryptoKey = await AesEngine.importKey({ algorithm, key, usage: 'encrypt' });
    const encrypted = await crypto.subtle.encrypt(
      AesEngine.getParams({ algorithm, iv }),
      cryptoKey,
      plain as TBytes,
    );
    const sealed = new Uint8Array(encrypted);

    if (algorithm === AESAlgorithms.AES_256_GCM) {
      return {
        cipherText: sealed.subarray(0, sealed.length - TAG_BYTES),
        authTag: sealed.subarray(sealed.length - TAG_BYTES),
      };
    }

    return { cipherText: sealed, authTag: null };
  }

  /** Throws when the tag does not authenticate: a GCM tag that is missing or not 16 bytes is refused before any decryption. */
  static async open(opts: {
    algorithm: AESAlgorithmType;
    key: Uint8Array;
    iv: Uint8Array;
    cipherText: Uint8Array;
    authTag: Uint8Array | null;
  }): Promise<Uint8Array> {
    const { algorithm, key, iv, cipherText, authTag } = opts;
    const cryptoKey = await AesEngine.importKey({ algorithm, key, usage: 'decrypt' });
    let input = cipherText;

    if (algorithm === AESAlgorithms.AES_256_GCM) {
      if (authTag === null || authTag.length !== TAG_BYTES) {
        throw getError({
          message: `[AesEngine][open] The GCM auth tag must be ${TAG_BYTES} bytes, got ${authTag?.length ?? 0}`,
        });
      }

      input = new Uint8Array(cipherText.length + TAG_BYTES);
      input.set(cipherText, 0);
      input.set(authTag, cipherText.length);
    }

    const decrypted = await crypto.subtle.decrypt(
      AesEngine.getParams({ algorithm, iv }),
      cryptoKey,
      input as TBytes,
    );
    return new Uint8Array(decrypted);
  }

  /** The key must be exactly the size the algorithm names: Web Crypto would otherwise run a 16 or 24 byte key as AES-128 or AES-192. */
  private static async importKey(opts: {
    algorithm: AESAlgorithmType;
    key: Uint8Array;
    usage: 'encrypt' | 'decrypt';
  }): Promise<CryptoKey> {
    const { algorithm, key, usage } = opts;
    const expected = Number(algorithm.split('-')[1]) / 8;

    if (key.length !== expected) {
      throw getError({
        message: `[AesEngine][importKey] Invalid key length ${key.length} bytes for ${algorithm}, expected ${expected}`,
      });
    }

    return crypto.subtle.importKey(
      'raw',
      key as TBytes,
      { name: AesEngine.getName({ algorithm }) },
      false,
      [usage],
    );
  }

  private static getName(opts: { algorithm: AESAlgorithmType }): 'AES-CBC' | 'AES-GCM' {
    return opts.algorithm === AESAlgorithms.AES_256_GCM ? 'AES-GCM' : 'AES-CBC';
  }

  private static getParams(opts: { algorithm: AESAlgorithmType; iv: Uint8Array }): TCipherParams {
    const { algorithm, iv } = opts;

    if (algorithm === AESAlgorithms.AES_256_GCM) {
      // GCM takes an IV of any length from 1 byte (12 is the usual one). `LegacyAES` read such data before, so it still does.
      if (iv.length === 0) {
        throw getError({ message: '[AesEngine][getParams] The GCM IV must not be empty' });
      }

      return { name: 'AES-GCM', iv: iv as TBytes, tagLength: TAG_BITS };
    }

    if (iv.length !== IV_BYTES) {
      throw getError({
        message: `[AesEngine][getParams] Invalid IV length ${iv.length} bytes, expected ${IV_BYTES}`,
      });
    }

    return { name: 'AES-CBC', iv: iv as TBytes };
  }
}
