import C from 'node:crypto';
import { getError } from '@/modules/error';
import { MINIMUM_RSA_MODULUS_BITS } from '../common/constants';
import { BaseCryptoAlgorithm } from './base.algorithm';

interface IRSAExtraOptions {
  inputEncoding?: { key: BufferEncoding; message: BufferEncoding };
  outputEncoding?: BufferEncoding;
  doThrow?: boolean;
}

export type RSAAlgorithmType = 'rsa';

export class RSA extends BaseCryptoAlgorithm<
  RSAAlgorithmType,
  string,
  string,
  string,
  string,
  string,
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
  generateDERKeyPair(opts?: { modulus: number }) {
    const modulus = opts?.modulus ?? MINIMUM_RSA_MODULUS_BITS;

    if (modulus < MINIMUM_RSA_MODULUS_BITS) {
      throw getError({
        message: `[RSA][generateDERKeyPair] Modulus ${modulus} is below the ${MINIMUM_RSA_MODULUS_BITS}-bit minimum`,
      });
    }

    const keys = C.generateKeyPairSync('rsa', {
      modulusLength: modulus,
    });

    return {
      publicKey: keys.publicKey.export({ type: 'spki', format: 'der' }),
      privateKey: keys.privateKey.export({ type: 'pkcs8', format: 'der' }),
    };
  }

  encrypt(opts: { message: string; secret: string; opts?: IRSAExtraOptions }) {
    const { message, secret: pubKey } = opts;
    const {
      inputEncoding = { key: 'base64', message: 'utf-8' },
      outputEncoding = 'base64',
      doThrow = true,
    } = opts.opts ?? {};

    try {
      const k = C.createPublicKey({
        key: Buffer.from(pubKey, inputEncoding.key),
        format: 'der',
        type: 'spki',
      });
      const rs = C.publicEncrypt(k, Buffer.from(message, inputEncoding.message));
      return rs.toString(outputEncoding);
    } catch (error) {
      if (doThrow) {
        throw error;
      }

      return message;
    }
  }

  decrypt(opts: { message: string; secret: string; opts?: IRSAExtraOptions }) {
    const { message, secret: privKey } = opts;
    const {
      inputEncoding = { key: 'base64', message: 'base64' },
      outputEncoding = 'utf-8',
      doThrow = true,
    } = opts.opts ?? {};

    try {
      const k = C.createPrivateKey({
        key: Buffer.from(privKey, inputEncoding.key),
        format: 'der',
        type: 'pkcs8',
      });
      const rs = C.privateDecrypt(k, Buffer.from(message, inputEncoding.message));
      return rs.toString(outputEncoding);
    } catch (error) {
      if (doThrow) {
        throw error;
      }

      return message;
    }
  }
}
