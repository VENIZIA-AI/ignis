import { ObjectUtility } from '@venizia/ignis-inversion';
import fs from 'node:fs';
import { DEFAULT_PAD_END } from '../common';
import { AESAlgorithms, type AESAlgorithmType } from './aes.constants';
import { AesEngine } from './aes.engine';
import { BaseCryptoAlgorithm } from './base.algorithm';

const DEFAULT_LENGTH = 16;

interface IAESExtraOptions {
  iv?: Buffer;
  inputEncoding?: BufferEncoding;
  outputEncoding?: BufferEncoding;
  doThrow?: boolean;
}

/**
 * Frozen back-compat format - keys come from `normalizeSecretKeyLegacy` (padEnd/truncate), never
 * PBKDF2. `kdfSalt`/`kdfIterations` are deliberately absent from `IAESExtraOptions`: there is no
 * salt to override, so the option would type-check and silently do nothing.
 * `encrypt` and `decrypt` are async: the cipher runs over `crypto.subtle`.
 */
export class LegacyAES extends BaseCryptoAlgorithm<
  AESAlgorithmType,
  string,
  string,
  string,
  Promise<string>,
  Promise<string>,
  IAESExtraOptions
> {
  constructor(opts: { algorithm: AESAlgorithmType }) {
    super({ scope: LegacyAES.name, ...opts });
  }

  static withAlgorithm(algorithm: AESAlgorithmType) {
    return new LegacyAES({ algorithm });
  }

  async encrypt(opts: {
    message: string;
    secret: string;
    opts?: IAESExtraOptions;
  }): Promise<string> {
    const { message, secret } = opts;
    const {
      iv = Buffer.from(crypto.getRandomValues(new Uint8Array(DEFAULT_LENGTH))),
      inputEncoding = 'utf-8',
      outputEncoding = 'base64',
      doThrow = true,
    } = opts.opts ?? {};

    try {
      const secretKey = this.normalizeSecretKeyLegacy({
        secret,
        length: this.getAlgorithmKeySize(),
      });

      const { cipherText, authTag } = await AesEngine.seal({
        algorithm: this.algorithm,
        key: Buffer.from(secretKey),
        iv,
        plain: Buffer.from(message, inputEncoding),
      });

      const parts: Uint8Array[] = [iv];

      if (authTag !== null) {
        parts.push(authTag);
      }
      parts.push(cipherText);

      return Buffer.concat(parts).toString(outputEncoding);
    } catch (error) {
      if (doThrow) {
        throw error;
      }

      return message;
    }
  }

  async encryptFile(opts: { absolutePath: string; secret: string }): Promise<string> {
    const { absolutePath, secret } = opts;

    if (!absolutePath || ObjectUtility.isEmpty({ value: absolutePath })) {
      return '';
    }

    const buffer = fs.readFileSync(absolutePath);
    const fileContent = buffer?.toString('utf-8');
    return this.encrypt({ message: fileContent, secret });
  }

  async decrypt(opts: {
    message: string;
    secret: string;
    opts?: IAESExtraOptions;
  }): Promise<string> {
    const { message, secret } = opts;
    const { inputEncoding = 'base64', outputEncoding = 'utf-8', doThrow = true } = opts.opts ?? {};

    try {
      const raw = Buffer.from(message, inputEncoding);
      const iv = opts.opts?.iv ?? raw.subarray(0, DEFAULT_LENGTH);
      let messageIndex = iv.length;

      const secretKey = this.normalizeSecretKeyLegacy({
        secret,
        length: this.getAlgorithmKeySize(),
      });

      let authTag: Uint8Array | null = null;
      if (this.algorithm === AESAlgorithms.AES_256_GCM) {
        authTag = raw.subarray(iv.length, iv.length + DEFAULT_LENGTH);
        messageIndex += authTag.length;
      }

      const plain = await AesEngine.open({
        algorithm: this.algorithm,
        key: Buffer.from(secretKey),
        iv,
        cipherText: raw.subarray(messageIndex),
        authTag,
      });
      return Buffer.from(plain).toString(outputEncoding);
    } catch (error) {
      if (doThrow) {
        throw error;
      }

      return message;
    }
  }

  async decryptFile(opts: { absolutePath: string; secret: string }): Promise<string> {
    const { absolutePath, secret } = opts;

    if (!absolutePath || ObjectUtility.isEmpty({ value: absolutePath })) {
      return '';
    }

    const buffer = fs.readFileSync(absolutePath);
    const fileContent = buffer?.toString('utf-8');
    return this.decrypt({ message: fileContent, secret });
  }

  private normalizeSecretKeyLegacy(opts: { secret: string; length: number; padEnd?: string }) {
    const { secret, length, padEnd = DEFAULT_PAD_END } = opts;

    if (secret.length > length) {
      return secret.slice(0, length);
    }

    return secret.padEnd(length, padEnd);
  }
}
