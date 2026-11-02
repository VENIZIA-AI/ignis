import { AESAlgorithms, type AESAlgorithmType } from './aes.constants';
import { ObjectUtility } from '@venizia/ignis-inversion';
import fs from 'node:fs';
import { getError } from '@/modules/error';
import { AesEngine } from './aes.engine';
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

export { AESAlgorithms, type AESAlgorithmType };

/** `encrypt` and `decrypt` are async: key derivation and the cipher run over `crypto.subtle`. */
export class AES extends BaseCryptoAlgorithm<
  AESAlgorithmType,
  string,
  string,
  TAESSecret,
  Promise<string>,
  Promise<string>,
  IAESExtraOptions
> {
  constructor(opts: { algorithm: AESAlgorithmType }) {
    super({ scope: AES.name, ...opts });
  }

  static withAlgorithm(algorithm: AESAlgorithmType) {
    return new AES({ algorithm });
  }

  protected async resolveEncryptKey(opts: {
    secret: TAESSecret;
    kdfSalt?: string;
    kdfIterations?: number;
  }): Promise<{ id: string; key: Buffer }> {
    const { secret, kdfSalt, kdfIterations } = opts;
    const entry = Array.isArray(secret) ? secret[0] : { id: DEFAULT_KEY_ID, secret };

    if (!entry || ObjectUtility.isEmpty({ value: entry.secret })) {
      throw getError({ message: '[AES][resolveEncryptKey] Missing secret or empty keyring' });
    }

    const key = await this.normalizeSecretKey({
      secret: entry.secret,
      length: this.getAlgorithmKeySize(),
      kdfSalt,
      kdfIterations,
    });
    return { id: entry.id, key };
  }

  protected async resolveDecryptKey(opts: {
    secret: TAESSecret;
    id: string;
    kdfSalt?: string;
    kdfIterations?: number;
  }): Promise<Buffer> {
    const { secret, id, kdfSalt, kdfIterations } = opts;
    const length = this.getAlgorithmKeySize();

    if (!Array.isArray(secret)) {
      return this.normalizeSecretKey({ secret, length, kdfSalt, kdfIterations });
    }

    const entry = secret.find((e) => e.id === id);
    if (!entry) {
      throw getError({
        message: `[AES][resolveDecryptKey] No key in keyring matches ciphertext key id "${id}"`,
      });
    }

    // Without this the empty secret derives a key from '' and fails as an opaque OpenSSL error, hiding a plain configuration mistake.
    if (ObjectUtility.isEmpty({ value: entry.secret })) {
      throw getError({
        message: `[AES][resolveDecryptKey] Keyring entry for key id "${id}" has an empty secret`,
      });
    }

    return this.normalizeSecretKey({
      secret: entry.secret,
      length,
      kdfSalt,
      kdfIterations,
    });
  }

  async encrypt(opts: {
    message: string;
    secret: TAESSecret;
    opts?: IAESExtraOptions;
  }): Promise<string> {
    const { message, secret } = opts;
    const {
      iv = Buffer.from(crypto.getRandomValues(new Uint8Array(DEFAULT_LENGTH))),
      inputEncoding = 'utf-8',
      outputEncoding = 'base64',
      doThrow = true,
      kdfSalt,
      kdfIterations,
    } = opts.opts ?? {};

    try {
      const { id, key } = await this.resolveEncryptKey({ secret, kdfSalt, kdfIterations });
      const idBuffer = Buffer.from(id, 'utf-8');
      if (idBuffer.length > 0xff) {
        throw getError({ message: '[AES][encrypt] Key id too long (max 255 bytes)' });
      }

      // `decrypt` reads exactly DEFAULT_LENGTH bytes of IV from the envelope, so any other length would write a ciphertext nothing can read.
      if (iv.length !== DEFAULT_LENGTH) {
        throw getError({
          message: `[AES][encrypt] The IV must be ${DEFAULT_LENGTH} bytes, got ${iv.length}`,
        });
      }

      const { cipherText, authTag } = await AesEngine.seal({
        algorithm: this.algorithm,
        key,
        iv,
        plain: Buffer.from(message, inputEncoding),
      });

      // Envelope: [version(1)][idLen(1)][id(idLen)][iv(16)][authTag(16, gcm only)][cipher]
      const header = Buffer.from([CIPHERTEXT_VERSION, idBuffer.length]);
      const parts: Uint8Array[] = [header, idBuffer, iv];

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

  async encryptFile(opts: { absolutePath: string; secret: TAESSecret }): Promise<string> {
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
    secret: TAESSecret;
    opts?: IAESDecryptOptions;
  }): Promise<string> {
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

      const key = await this.resolveDecryptKey({ secret, id, kdfSalt, kdfIterations });

      let authTag: Uint8Array | null = null;
      if (this.algorithm === AESAlgorithms.AES_256_GCM) {
        authTag = raw.subarray(cursor, cursor + DEFAULT_LENGTH);
        cursor += DEFAULT_LENGTH;
      }

      const plain = await AesEngine.open({
        algorithm: this.algorithm,
        key,
        iv,
        cipherText: raw.subarray(cursor),
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

  async decryptFile(opts: { absolutePath: string; secret: TAESSecret }): Promise<string> {
    const { absolutePath, secret } = opts;

    if (!absolutePath || ObjectUtility.isEmpty({ value: absolutePath })) {
      return '';
    }

    const buffer = fs.readFileSync(absolutePath);
    const fileContent = buffer?.toString('utf-8');
    return this.decrypt({ message: fileContent, secret });
  }
}
