import isEmpty from 'lodash/isEmpty';
import C from 'node:crypto';
import fs from 'node:fs';
import { getError } from '@/modules/error';
import { BaseCryptoAlgorithm } from './base.algorithm';

const DEFAULT_LENGTH = 16;
const CIPHERTEXT_VERSION = 0x01;
const DEFAULT_KEY_ID = '0';

interface IAESDecryptOptions {
  inputEncoding?: BufferEncoding;
  outputEncoding?: BufferEncoding;
  doThrow?: boolean;
  /** Per-deployment PBKDF2 salt override. Must be supplied identically on encrypt and decrypt; omit for the shipped default. */
  kdfSalt?: string;
  /** PBKDF2 iteration count override. Must be supplied identically on encrypt and decrypt; omit for the shipped default. */
  kdfIterations?: number;
}

/** `iv` is encrypt-only: the envelope carries the IV, so decrypt reads it from there and a supplied one would be silently ignored. */
interface IAESExtraOptions extends IAESDecryptOptions {
  iv?: Buffer;
}

export interface IAESKeyringEntry {
  id: string;
  secret: string;
}

export type TAESSecret = string | IAESKeyringEntry[];

export type AESAlgorithmType = 'aes-256-cbc' | 'aes-256-gcm';

export class AES extends BaseCryptoAlgorithm<
  AESAlgorithmType,
  string,
  string,
  TAESSecret,
  string,
  string,
  IAESExtraOptions
> {
  constructor(opts: { algorithm: AESAlgorithmType }) {
    super({ scope: AES.name, ...opts });
  }

  static withAlgorithm(algorithm: AESAlgorithmType) {
    return new AES({ algorithm });
  }

  protected resolveEncryptKey(opts: {
    secret: TAESSecret;
    kdfSalt?: string;
    kdfIterations?: number;
  }): { id: string; key: Buffer } {
    const { secret, kdfSalt, kdfIterations } = opts;
    const entry = Array.isArray(secret) ? secret[0] : { id: DEFAULT_KEY_ID, secret };

    if (!entry || isEmpty(entry.secret)) {
      throw getError({ message: '[AES][resolveEncryptKey] Missing secret or empty keyring' });
    }

    const key = this.normalizeSecretKey({
      secret: entry.secret,
      length: this.getAlgorithmKeySize(),
      kdfSalt,
      kdfIterations,
    });
    return { id: entry.id, key };
  }

  protected resolveDecryptKey(opts: {
    secret: TAESSecret;
    id: string;
    kdfSalt?: string;
    kdfIterations?: number;
  }): Buffer {
    const { secret, id, kdfSalt, kdfIterations } = opts;
    const length = this.getAlgorithmKeySize();

    if (!Array.isArray(secret)) {
      return this.normalizeSecretKey({ secret, length, kdfSalt, kdfIterations });
    }

    const entry = secret.find(e => e.id === id);
    if (!entry) {
      throw getError({
        message: `[AES][resolveDecryptKey] No key in keyring matches ciphertext key id "${id}"`,
      });
    }

    // Without this the empty secret derives a key from '' and fails as an opaque OpenSSL error, hiding a plain configuration mistake.
    if (isEmpty(entry.secret)) {
      throw getError({
        message: `[AES][resolveDecryptKey] Keyring entry for key id "${id}" has an empty secret`,
      });
    }

    return this.normalizeSecretKey({ secret: entry.secret, length, kdfSalt, kdfIterations });
  }

  encrypt(opts: { message: string; secret: TAESSecret; opts?: IAESExtraOptions }) {
    const { message, secret } = opts;
    const {
      iv = C.randomBytes(DEFAULT_LENGTH),
      inputEncoding = 'utf-8',
      outputEncoding = 'base64',
      doThrow = true,
      kdfSalt,
      kdfIterations,
    } = opts.opts ?? {};

    try {
      const { id, key } = this.resolveEncryptKey({ secret, kdfSalt, kdfIterations });
      const idBuffer = Buffer.from(id, 'utf-8');
      if (idBuffer.length > 0xff) {
        throw getError({ message: '[AES][encrypt] Key id too long (max 255 bytes)' });
      }

      const cipher = C.createCipheriv(this.algorithm, key, iv);

      // Envelope: [version(1)][idLen(1)][id(idLen)][iv(16)][authTag(16, gcm only)][cipher]
      const header = Buffer.from([CIPHERTEXT_VERSION, idBuffer.length]);
      const parts = [header, idBuffer, iv];

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

  encryptFile(opts: { absolutePath: string; secret: TAESSecret }): string {
    const { absolutePath, secret } = opts;

    if (!absolutePath || isEmpty(absolutePath)) {
      return '';
    }

    const buffer = fs.readFileSync(absolutePath);
    const fileContent = buffer?.toString('utf-8');
    const encrypted = this.encrypt({ message: fileContent, secret });
    return encrypted;
  }

  decrypt(opts: { message: string; secret: TAESSecret; opts?: IAESDecryptOptions }) {
    const { message, secret } = opts;
    const {
      inputEncoding = 'base64',
      outputEncoding = 'utf-8',
      doThrow = true,
      kdfSalt,
      kdfIterations,
    } = opts.opts ?? {};

    try {
      const raw = Buffer.from(message, inputEncoding);

      const version = raw[0];
      if (version !== CIPHERTEXT_VERSION) {
        throw getError({ message: `[AES][decrypt] Unsupported ciphertext version: ${version}` });
      }

      const idLength = raw[1];
      let cursor = 2;

      const id = raw.subarray(cursor, cursor + idLength).toString('utf-8');
      cursor += idLength;

      const iv = raw.subarray(cursor, cursor + DEFAULT_LENGTH);
      cursor += DEFAULT_LENGTH;

      const key = this.resolveDecryptKey({ secret, id, kdfSalt, kdfIterations });
      const decipher = C.createDecipheriv(this.algorithm, key, iv);

      switch (this.algorithm) {
        case 'aes-256-cbc': {
          break;
        }
        case 'aes-256-gcm': {
          const authTag = raw.subarray(cursor, cursor + DEFAULT_LENGTH);
          cursor += DEFAULT_LENGTH;
          (decipher as C.DecipherGCM).setAuthTag(authTag);
          break;
        }
      }

      const cipherText = raw.subarray(cursor);
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

  decryptFile(opts: { absolutePath: string; secret: TAESSecret }) {
    const { absolutePath, secret } = opts;

    if (!absolutePath || isEmpty(absolutePath)) {
      return '';
    }

    const buffer = fs.readFileSync(absolutePath);
    const fileContent = buffer?.toString('utf-8');
    const decrypted = this.decrypt({ message: fileContent, secret });
    return decrypted;
  }
}
