import { AbstractCryptoAlgorithm } from './base.algorithm';

const CURVE = { name: 'ECDH', namedCurve: 'P-256' } as const;
const CIPHER = 'AES-GCM' as const;
const KEY_BITS = 256;
const IV_BYTES = 12;
const DEFAULT_HKDF_INFO = 'ignis-ecdh-aes-gcm';

export type ECDHAlgorithmType = 'ecdh-p256';

export interface IECDHEncryptedPayload {
  iv: string;
  ct: string;
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
  Promise<string>
> {
  private readonly hkdfInfo: Uint8Array;

  constructor(opts?: { algorithm: ECDHAlgorithmType; hkdfInfo?: string }) {
    super({
      scope: ECDH.name,
      identifier: 'ecdh-p256',
    });

    this.algorithm = 'ecdh-p256';
    this.hkdfInfo = new TextEncoder().encode(opts?.hkdfInfo ?? DEFAULT_HKDF_INFO);
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
  }): Promise<CryptoKey> {
    const { privateKey, peerPublicKey } = opts;

    const sharedBits = await crypto.subtle.deriveBits(
      { name: 'ECDH', public: peerPublicKey },
      privateKey,
      KEY_BITS,
    );

    const hkdfKey = await crypto.subtle.importKey('raw', sharedBits, 'HKDF', false, ['deriveKey']);

    return crypto.subtle.deriveKey(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: new Uint8Array(32),
        info: this.hkdfInfo as Uint8Array<ArrayBuffer>,
      },
      hkdfKey,
      { name: CIPHER, length: KEY_BITS },
      false,
      ['encrypt', 'decrypt'],
    );
  }

  // ----------------------------------------------------------------------------------------------------
  async encrypt(opts: { message: string; secret: CryptoKey }): Promise<IECDHEncryptedPayload> {
    const { message, secret: key } = opts;
    const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
    const ct = await crypto.subtle.encrypt(
      { name: CIPHER, iv },
      key,
      new TextEncoder().encode(message),
    );

    return { iv: ECDH.toBase64(iv.buffer as ArrayBuffer), ct: ECDH.toBase64(ct) };
  }

  // ----------------------------------------------------------------------------------------------------
  async decrypt(opts: { message: IECDHEncryptedPayload; secret: CryptoKey }): Promise<string> {
    const { message: payload, secret: key } = opts;
    const decrypted = await crypto.subtle.decrypt(
      { name: CIPHER, iv: new Uint8Array(ECDH.fromBase64(payload.iv)) },
      key,
      ECDH.fromBase64(payload.ct),
    );

    return new TextDecoder().decode(decrypted);
  }

  // ----------------------------------------------------------------------------------------------------
  private static toBase64(buffer: ArrayBuffer): string {
    return Buffer.from(buffer).toString('base64');
  }

  private static fromBase64(base64: string): ArrayBuffer {
    return Buffer.from(base64, 'base64').buffer as ArrayBuffer;
  }
}
