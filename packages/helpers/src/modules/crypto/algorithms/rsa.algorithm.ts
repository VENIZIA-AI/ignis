import C from 'node:crypto';
import { BaseCryptoAlgorithm } from './base.algorithm';

interface IRSAExtraOptions {
  inputEncoding?: { key: C.Encoding; message: C.Encoding };
  outputEncoding?: C.Encoding;
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

  generateDERKeyPair(opts?: { modulus: number }) {
    const keys = C.generateKeyPairSync('rsa', {
      modulusLength: opts?.modulus ?? 2048,
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
