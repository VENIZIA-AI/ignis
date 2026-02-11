import { getError } from '@/helpers/error';
import { AbstractCryptoAlgorithm } from './base.algorithm';

const CURVE = { name: 'ECDH', namedCurve: 'P-256' } as const;
const CIPHER = 'AES-GCM' as const;
const KEY_BITS = 256;
const IV_BYTES = 12;
const DEFAULT_HKDF_INFO = 'ignis-ecdh-p256-aes-256-gcm-v1';
const SALT_BYTES = 32;
const TAG_BITS = 128;

export type ECDHAlgorithmType = 'ecdh-p256';

export interface IECDHEncryptedPayload {
  iv: string;
  ct: string;
}

export interface IECDHExtraOptions {
  additionalData?: string;
}

/**
 * ECDH P-256 key exchange with HKDF-derived AES-256-GCM session encryption.
 *
 * Uses Web Crypto API (`crypto.subtle`) — works in both Bun and browsers.
 * All crypto methods are stateless.
 */
export class ECDH extends AbstractCryptoAlgorithm<
  ECDHAlgorithmType,
  string,
  IECDHEncryptedPayload,
  CryptoKey,
  Promise<IECDHEncryptedPayload>,
  Promise<string>,
  IECDHExtraOptions
> {
  private static readonly encoder = new TextEncoder();
  private static readonly decoder = new TextDecoder();
  private readonly hkdfInfo: Uint8Array;

  constructor(opts?: { algorithm: ECDHAlgorithmType; hkdfInfo?: string }) {
    super({
      scope: ECDH.name,
      identifier: 'ecdh-p256',
    });

    this.algorithm = 'ecdh-p256';
    this.hkdfInfo = ECDH.encoder.encode(opts?.hkdfInfo ?? DEFAULT_HKDF_INFO);
  }

  static withAlgorithm(opts?: { algorithm: ECDHAlgorithmType; hkdfInfo?: string }) {
    return new ECDH(opts);
  }

  // ----------------------------------------------------------------------------------------------------
  async generateKeyPair(): Promise<{ keyPair: CryptoKeyPair; publicKeyB64: string }> {
    const keyPair = await crypto.subtle.generateKey(CURVE, false, ['deriveBits']);
    const raw = await crypto.subtle.exportKey('raw', keyPair.publicKey);
    return { keyPair, publicKeyB64: ECDH.toBase64(raw) };
  }

  // ----------------------------------------------------------------------------------------------------
  async importPublicKey(opts: { rawKeyB64: string }): Promise<CryptoKey> {
    return crypto.subtle.importKey('raw', ECDH.fromBase64(opts.rawKeyB64), CURVE, false, []);
  }

  // ----------------------------------------------------------------------------------------------------
  async deriveAESKey(opts: {
    privateKey: CryptoKey;
    peerPublicKey: CryptoKey;
    salt?: string;
  }): Promise<{ key: CryptoKey; salt: string }> {
    const { privateKey, peerPublicKey, salt: saltB64 } = opts;

    const salt = saltB64
      ? new Uint8Array(ECDH.fromBase64(saltB64))
      : crypto.getRandomValues(new Uint8Array(SALT_BYTES));

    const sharedBits = await crypto.subtle.deriveBits(
      { name: 'ECDH', public: peerPublicKey },
      privateKey,
      KEY_BITS,
    );

    const hkdfKey = await crypto.subtle.importKey('raw', sharedBits, 'HKDF', false, ['deriveKey']);

    const key = await crypto.subtle.deriveKey(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: salt as Uint8Array<ArrayBuffer>,
        info: this.hkdfInfo as Uint8Array<ArrayBuffer>,
      },
      hkdfKey,
      { name: CIPHER, length: KEY_BITS },
      false,
      ['encrypt', 'decrypt'],
    );

    return { key, salt: ECDH.toBase64(salt) };
  }

  // ----------------------------------------------------------------------------------------------------
  async encrypt(opts: {
    message: string;
    secret: CryptoKey;
    opts?: IECDHExtraOptions;
  }): Promise<IECDHEncryptedPayload> {
    const { message, secret: key, opts: extra } = opts;
    const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
    const ct = await crypto.subtle.encrypt(
      {
        name: CIPHER,
        iv,
        tagLength: TAG_BITS,
        ...(extra?.additionalData && {
          additionalData: ECDH.encoder.encode(extra.additionalData),
        }),
      },
      key,
      ECDH.encoder.encode(message),
    );

    return { iv: ECDH.toBase64(iv), ct: ECDH.toBase64(ct) };
  }

  // ----------------------------------------------------------------------------------------------------
  async decrypt(opts: {
    message: IECDHEncryptedPayload;
    secret: CryptoKey;
    opts?: IECDHExtraOptions;
  }): Promise<string> {
    const { message: payload, secret: key, opts: extra } = opts;
    const decrypted = await crypto.subtle.decrypt(
      {
        name: CIPHER,
        iv: new Uint8Array(ECDH.fromBase64(payload.iv)),
        tagLength: TAG_BITS,
        ...(extra?.additionalData && {
          additionalData: ECDH.encoder.encode(extra.additionalData),
        }),
      },
      key,
      ECDH.fromBase64(payload.ct),
    );

    return ECDH.decoder.decode(decrypted);
  }

  // ----------------------------------------------------------------------------------------------------
  private static toBase64(data: ArrayBuffer | Uint8Array): string {
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    return Buffer.from(bytes).toString('base64');
  }

  private static fromBase64(base64: string): ArrayBuffer {
    if (!base64.length || base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) {
      throw getError({ message: '[ECDH.fromBase64] Invalid base64 input' });
    }
    const buf = Buffer.from(base64, 'base64');
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  }
}
