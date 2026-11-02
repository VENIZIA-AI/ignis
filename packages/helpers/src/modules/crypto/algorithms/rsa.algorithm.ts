import { getError } from '@/modules/error';
import { MINIMUM_RSA_MODULUS_BITS } from '../common/constants';
import { BaseCryptoAlgorithm } from './base.algorithm';

interface IRSAExtraOptions {
  inputEncoding?: { key: BufferEncoding; message: BufferEncoding };
  outputEncoding?: BufferEncoding;
  doThrow?: boolean;
}

export type RSAAlgorithmType = 'rsa';

/**
 * OAEP with SHA-1 for both the label hash and MGF1, and the public exponent 65537: what Node's
 * `publicEncrypt`/`privateDecrypt` and `generateKeyPairSync('rsa')` used by default, so keys and
 * ciphertext written by earlier releases still work. Do not change them: every ciphertext stored under
 * them would stop decrypting.
 */
const OAEP = { name: 'RSA-OAEP', hash: 'SHA-1' } as const;
const PUBLIC_EXPONENT = new Uint8Array([0x01, 0x00, 0x01]);

/** `generateDERKeyPair`, `encrypt` and `decrypt` are async: they run over `crypto.subtle`. */
export class RSA extends BaseCryptoAlgorithm<
  RSAAlgorithmType,
  string,
  string,
  string,
  Promise<string>,
  Promise<string>,
  IRSAExtraOptions
> {
  constructor(opts: { algorithm: RSAAlgorithmType }) {
    super({ scope: RSA.name, ...opts });
  }

  static withAlgorithm() {
    return new RSA({ algorithm: 'rsa' });
  }

  /**
   * Rejects a modulus below `MINIMUM_RSA_MODULUS_BITS` rather than generating it - a weak key still
   * works, signs, and verifies, so this is the only point where the size is ever checked.
   */
  async generateDERKeyPair(opts?: { modulus: number }) {
    const modulus = opts?.modulus ?? MINIMUM_RSA_MODULUS_BITS;

    if (modulus < MINIMUM_RSA_MODULUS_BITS) {
      throw getError({
        message: `[RSA][generateDERKeyPair] Modulus ${modulus} is below the ${MINIMUM_RSA_MODULUS_BITS}-bit minimum`,
      });
    }

    const keys = await crypto.subtle.generateKey(
      { ...OAEP, modulusLength: modulus, publicExponent: PUBLIC_EXPONENT },
      true,
      ['encrypt', 'decrypt'],
    );

    const publicKey = await crypto.subtle.exportKey('spki', keys.publicKey);
    const privateKey = await crypto.subtle.exportKey('pkcs8', keys.privateKey);

    return { publicKey: Buffer.from(publicKey), privateKey: Buffer.from(privateKey) };
  }

  async encrypt(opts: {
    message: string;
    secret: string;
    opts?: IRSAExtraOptions;
  }): Promise<string> {
    const { message, secret: pubKey } = opts;
    const {
      inputEncoding = { key: 'base64', message: 'utf-8' },
      outputEncoding = 'base64',
      doThrow = true,
    } = opts.opts ?? {};

    try {
      const key = await crypto.subtle.importKey(
        'spki',
        Buffer.from(pubKey, inputEncoding.key),
        OAEP,
        false,
        ['encrypt'],
      );
      const cipherBytes = await crypto.subtle.encrypt(
        { name: OAEP.name },
        key,
        Buffer.from(message, inputEncoding.message),
      );
      return Buffer.from(cipherBytes).toString(outputEncoding);
    } catch (error) {
      if (doThrow) {
        throw error;
      }

      return message;
    }
  }

  async decrypt(opts: {
    message: string;
    secret: string;
    opts?: IRSAExtraOptions;
  }): Promise<string> {
    const { message, secret: privKey } = opts;
    const {
      inputEncoding = { key: 'base64', message: 'base64' },
      outputEncoding = 'utf-8',
      doThrow = true,
    } = opts.opts ?? {};

    try {
      const key = await crypto.subtle.importKey(
        'pkcs8',
        Buffer.from(privKey, inputEncoding.key),
        OAEP,
        false,
        ['decrypt'],
      );
      const plainBytes = await crypto.subtle.decrypt(
        { name: OAEP.name },
        key,
        Buffer.from(message, inputEncoding.message),
      );
      return Buffer.from(plainBytes).toString(outputEncoding);
    } catch (error) {
      if (doThrow) {
        throw error;
      }

      return message;
    }
  }
}
