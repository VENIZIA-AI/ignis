import isEmpty from 'lodash/isEmpty';
import C from 'node:crypto';
import fs from 'node:fs';
import { BaseCryptoAlgorithm } from './base.algorithm';

const DEFAULT_LENGTH = 16;

interface IO {
  iv?: Buffer;
  inputEncoding?: C.Encoding;
  outputEncoding?: C.Encoding;
  doThrow?: boolean;
}

export type AESAlgorithmType = 'aes-256-cbc' | 'aes-256-gcm';

export class AES extends BaseCryptoAlgorithm<AESAlgorithmType, IO> {
  constructor(opts: { algorithm: AESAlgorithmType }) {
    super({ scope: AES.name, ...opts });
  }

  static withAlgorithm(algorithm: AESAlgorithmType) {
    return new AES({ algorithm });
  }

  encrypt(message: string, secret: string, opts?: IO) {
    const {
      iv = C.randomBytes(DEFAULT_LENGTH),
      inputEncoding = 'utf-8',
      outputEncoding = 'base64',
      doThrow = true,
    } = opts ?? {};

    try {
      const secretKey = this.normalizeSecretKey({
        secret,
        length: this.getAlgorithmKeySize(),
      });

      const cipher = C.createCipheriv(this.algorithm, Buffer.from(secretKey), iv);

      const parts = [iv];
      const cipherText = cipher.update(message, inputEncoding);
      const cipherFinal = cipher.final();

      switch (this.algorithm) {
        case 'aes-256-cbc': {
          break;
        }
        case 'aes-256-gcm': {
          parts.push((cipher as C.CipherGCM).getAuthTag());
          break;
        }
      }
      parts.push(cipherText);
      parts.push(cipherFinal);

      return Buffer.concat(parts).toString(outputEncoding);
    } catch (error) {
      if (doThrow) {
        throw error;
      }

      return message;
    }
  }

  encryptFile(absolutePath: string, secret: string): string {
    if (!absolutePath || isEmpty(absolutePath)) {
      return '';
    }

    const buffer = fs.readFileSync(absolutePath);
    const fileContent = buffer?.toString('utf-8');
    const encrypted = this.encrypt(fileContent, secret);
    return encrypted;
  }

  decrypt(message: string, secret: string, opts?: IO) {
    const { inputEncoding = 'base64', outputEncoding = 'utf-8', doThrow = true } = opts ?? {};

    try {
      const iv =
        opts?.iv ??
        Buffer.from(message, inputEncoding).subarray(0, DEFAULT_LENGTH) ??
        Buffer.alloc(DEFAULT_LENGTH, 0);
      let messageIndex = iv.length;

      const secretKey = this.normalizeSecretKey({
        secret,
        length: this.getAlgorithmKeySize(),
      });
      const decipher = C.createDecipheriv(this.algorithm, Buffer.from(secretKey), iv);

      switch (this.algorithm) {
        case 'aes-256-cbc': {
          break;
        }
        case 'aes-256-gcm': {
          const authTag = Buffer.from(message, inputEncoding).subarray(
            iv.length,
            iv.length + DEFAULT_LENGTH,
          );
          messageIndex += authTag.length;
          (decipher as C.DecipherGCM).setAuthTag(authTag);
          break;
        }
      }

      const cipherText = Buffer.from(message, inputEncoding).subarray(messageIndex);
      return Buffer.concat([decipher.update(cipherText), decipher.final()]).toString(
        outputEncoding,
      );
    } catch (error) {
      if (doThrow) {
        throw error;
      }

      return message;
    }
  }

  decryptFile(absolutePath: string, secret: string) {
    if (!absolutePath || isEmpty(absolutePath)) {
      return '';
    }

    const buffer = fs.readFileSync(absolutePath);
    const fileContent = buffer?.toString('utf-8');
    const decrypted = this.decrypt(fileContent, secret);
    return decrypted;
  }
}
