/**
 * Crypto Algorithms Test Suite
 *
 * Tests all crypto algorithm implementations:
 * 1. BaseCryptoAlgorithm — construction, validation, key normalization, key size parsing
 * 2. AES — encrypt/decrypt for aes-256-cbc and aes-256-gcm, file operations
 * 3. RSA — key pair generation, encrypt/decrypt with DER keys
 * 4. ECDH — key exchange, AES-GCM session encryption via Web Crypto API
 *
 * @module __tests__/crypto/algorithms
 */

import { describe, test, expect, beforeAll } from 'bun:test';
import C from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AES, RSA, ECDH } from '@/helpers/crypto/algorithms';
import type { IECDHEncryptedPayload } from '@/helpers/crypto/algorithms';

// =============================================================================
// Helpers
// =============================================================================

const SECRET_32 = 'abcdefghijklmnopqrstuvwxyz012345'; // exactly 32 chars
const SECRET_SHORT = 'short';
const SECRET_LONG = 'this-secret-is-longer-than-thirty-two-characters-definitely';

// =============================================================================
// BaseCryptoAlgorithm (tested through AES since it's abstract)
// =============================================================================

describe('Crypto Algorithms', () => {
  describe('BaseCryptoAlgorithm', () => {
    // -------------------------------------------------------------------------
    // Construction & Validation
    // -------------------------------------------------------------------------

    describe('Construction & Validation', () => {
      test('TC-001: should construct with valid algorithm name', () => {
        const aes = AES.withAlgorithm('aes-256-cbc');
        expect(aes).toBeDefined();
        expect(aes.algorithm).toBe('aes-256-cbc');
      });

      test('TC-002: should store algorithm name on instance', () => {
        const aes = AES.withAlgorithm('aes-256-gcm');
        expect(aes.algorithm).toBe('aes-256-gcm');
      });

      test('TC-003: should throw on empty algorithm name', () => {
        expect(() => new AES({ algorithm: '' as any })).toThrow();
      });
    });

    // -------------------------------------------------------------------------
    // normalizeSecretKey
    // -------------------------------------------------------------------------

    describe('normalizeSecretKey', () => {
      let aes: AES;

      beforeAll(() => {
        aes = AES.withAlgorithm('aes-256-cbc');
      });

      test('TC-004: should pad short secret to target length', () => {
        const result = aes['normalizeSecretKey']({ secret: 'abc', length: 8 });
        expect(result.length).toBe(8);
        expect(result.startsWith('abc')).toBe(true);
      });

      test('TC-005: should truncate long secret to target length', () => {
        const result = aes['normalizeSecretKey']({ secret: SECRET_LONG, length: 32 });
        expect(result.length).toBe(32);
        expect(result).toBe(SECRET_LONG.slice(0, 32));
      });

      test('TC-006: should return exact-length secret unchanged (content-wise)', () => {
        const result = aes['normalizeSecretKey']({ secret: SECRET_32, length: 32 });
        expect(result.length).toBe(32);
        expect(result).toBe(SECRET_32);
      });

      test('TC-007: should use custom padEnd character', () => {
        const result = aes['normalizeSecretKey']({ secret: 'abc', length: 6, padEnd: 'x' });
        expect(result).toBe('abcxxx');
      });

      test('TC-008: should handle empty secret', () => {
        const result = aes['normalizeSecretKey']({ secret: '', length: 4 });
        expect(result.length).toBe(4);
      });
    });

    // -------------------------------------------------------------------------
    // getAlgorithmKeySize
    // -------------------------------------------------------------------------

    describe('getAlgorithmKeySize', () => {
      test('TC-009: should parse 256-bit key size from aes-256-cbc', () => {
        const aes = AES.withAlgorithm('aes-256-cbc');
        expect(aes['getAlgorithmKeySize']()).toBe(32);
      });

      test('TC-010: should parse 256-bit key size from aes-256-gcm', () => {
        const aes = AES.withAlgorithm('aes-256-gcm');
        expect(aes['getAlgorithmKeySize']()).toBe(32);
      });
    });
  });

  // ===========================================================================
  // AES
  // ===========================================================================

  describe('AES', () => {
    // -------------------------------------------------------------------------
    // Factory
    // -------------------------------------------------------------------------

    describe('Factory', () => {
      test('TC-011: withAlgorithm should create aes-256-cbc instance', () => {
        const aes = AES.withAlgorithm('aes-256-cbc');
        expect(aes).toBeInstanceOf(AES);
        expect(aes.algorithm).toBe('aes-256-cbc');
      });

      test('TC-012: withAlgorithm should create aes-256-gcm instance', () => {
        const aes = AES.withAlgorithm('aes-256-gcm');
        expect(aes).toBeInstanceOf(AES);
        expect(aes.algorithm).toBe('aes-256-gcm');
      });
    });

    // -------------------------------------------------------------------------
    // AES-256-CBC
    // -------------------------------------------------------------------------

    describe('AES-256-CBC', () => {
      let aes: AES;

      beforeAll(() => {
        aes = AES.withAlgorithm('aes-256-cbc');
      });

      test('TC-013: encrypt/decrypt roundtrip with default options', () => {
        const plaintext = 'Hello, Ignis!';
        const encrypted = aes.encrypt({ message: plaintext, secret: SECRET_32 });
        expect(encrypted).not.toBe(plaintext);

        const decrypted = aes.decrypt({ message: encrypted, secret: SECRET_32 });
        expect(decrypted).toBe(plaintext);
      });

      test('TC-014: encrypt/decrypt roundtrip with short secret (auto-padded)', () => {
        const plaintext = 'pad my secret';
        const encrypted = aes.encrypt({ message: plaintext, secret: SECRET_SHORT });
        const decrypted = aes.decrypt({ message: encrypted, secret: SECRET_SHORT });
        expect(decrypted).toBe(plaintext);
      });

      test('TC-015: encrypt/decrypt roundtrip with long secret (auto-truncated)', () => {
        const plaintext = 'truncate my secret';
        const encrypted = aes.encrypt({ message: plaintext, secret: SECRET_LONG });
        const decrypted = aes.decrypt({ message: encrypted, secret: SECRET_LONG });
        expect(decrypted).toBe(plaintext);
      });

      test('TC-016: encrypt/decrypt with explicit IV', () => {
        const plaintext = 'explicit iv test';
        const iv = C.randomBytes(16);
        const encrypted = aes.encrypt({ message: plaintext, secret: SECRET_32, opts: { iv } });
        const decrypted = aes.decrypt({ message: encrypted, secret: SECRET_32, opts: { iv } });
        expect(decrypted).toBe(plaintext);
      });

      test('TC-017: same plaintext produces different ciphertext (random IV)', () => {
        const plaintext = 'randomness check';
        const e1 = aes.encrypt({ message: plaintext, secret: SECRET_32 });
        const e2 = aes.encrypt({ message: plaintext, secret: SECRET_32 });
        expect(e1).not.toBe(e2);
      });

      test('TC-018: decrypt with wrong secret should throw by default', () => {
        const encrypted = aes.encrypt({ message: 'secret data', secret: SECRET_32 });
        expect(() => aes.decrypt({ message: encrypted, secret: 'wrong-secret-key' })).toThrow();
      });

      test('TC-019: decrypt with wrong secret and doThrow=false returns original message', () => {
        const encrypted = aes.encrypt({ message: 'secret data', secret: SECRET_32 });
        const result = aes.decrypt({
          message: encrypted,
          secret: 'wrong-secret-key',
          opts: { doThrow: false },
        });
        expect(result).toBe(encrypted);
      });

      test('TC-020: encrypt with doThrow=false returns original on error', () => {
        const aesInvalid = new AES({ algorithm: 'aes-256-cbc' });
        // Force an error by using an IV with wrong length
        const result = aesInvalid.encrypt({
          message: 'test',
          secret: SECRET_32,
          opts: { iv: Buffer.alloc(1), doThrow: false },
        });
        expect(result).toBe('test');
      });

      test('TC-021: encrypt/decrypt empty string', () => {
        const encrypted = aes.encrypt({ message: '', secret: SECRET_32 });
        const decrypted = aes.decrypt({ message: encrypted, secret: SECRET_32 });
        expect(decrypted).toBe('');
      });

      test('TC-022: encrypt/decrypt unicode content', () => {
        const plaintext = '你好世界 🌍 こんにちは مرحبا';
        const encrypted = aes.encrypt({ message: plaintext, secret: SECRET_32 });
        const decrypted = aes.decrypt({ message: encrypted, secret: SECRET_32 });
        expect(decrypted).toBe(plaintext);
      });

      test('TC-023: encrypt/decrypt long message (10KB)', () => {
        const plaintext = 'A'.repeat(10 * 1024);
        const encrypted = aes.encrypt({ message: plaintext, secret: SECRET_32 });
        const decrypted = aes.decrypt({ message: encrypted, secret: SECRET_32 });
        expect(decrypted).toBe(plaintext);
      });

      test('TC-024: encrypt/decrypt with hex output encoding', () => {
        const plaintext = 'hex encoding test';
        const encrypted = aes.encrypt({
          message: plaintext,
          secret: SECRET_32,
          opts: { outputEncoding: 'hex' },
        });
        const decrypted = aes.decrypt({
          message: encrypted,
          secret: SECRET_32,
          opts: { inputEncoding: 'hex' },
        });
        expect(decrypted).toBe(plaintext);
      });

      test('TC-025: encrypt/decrypt JSON payload', () => {
        const payload = JSON.stringify({ userId: 1, role: 'admin', permissions: ['read', 'write'] });
        const encrypted = aes.encrypt({ message: payload, secret: SECRET_32 });
        const decrypted = aes.decrypt({ message: encrypted, secret: SECRET_32 });
        expect(JSON.parse(decrypted)).toEqual(JSON.parse(payload));
      });
    });

    // -------------------------------------------------------------------------
    // AES-256-GCM
    // -------------------------------------------------------------------------

    describe('AES-256-GCM', () => {
      let aes: AES;

      beforeAll(() => {
        aes = AES.withAlgorithm('aes-256-gcm');
      });

      test('TC-026: encrypt/decrypt roundtrip with default options', () => {
        const plaintext = 'GCM mode test';
        const encrypted = aes.encrypt({ message: plaintext, secret: SECRET_32 });
        expect(encrypted).not.toBe(plaintext);

        const decrypted = aes.decrypt({ message: encrypted, secret: SECRET_32 });
        expect(decrypted).toBe(plaintext);
      });

      test('TC-027: encrypt/decrypt with short secret', () => {
        const plaintext = 'GCM short secret';
        const encrypted = aes.encrypt({ message: plaintext, secret: SECRET_SHORT });
        const decrypted = aes.decrypt({ message: encrypted, secret: SECRET_SHORT });
        expect(decrypted).toBe(plaintext);
      });

      test('TC-028: encrypt/decrypt with long secret', () => {
        const plaintext = 'GCM long secret';
        const encrypted = aes.encrypt({ message: plaintext, secret: SECRET_LONG });
        const decrypted = aes.decrypt({ message: encrypted, secret: SECRET_LONG });
        expect(decrypted).toBe(plaintext);
      });

      test('TC-029: GCM detects tampered ciphertext (auth tag integrity)', () => {
        const encrypted = aes.encrypt({ message: 'tamper test', secret: SECRET_32 });

        // Flip a byte in the middle of the ciphertext
        const buf = Buffer.from(encrypted, 'base64');
        buf[buf.length - 1] ^= 0xff;
        const tampered = buf.toString('base64');

        expect(() => aes.decrypt({ message: tampered, secret: SECRET_32 })).toThrow();
      });

      test('TC-030: same plaintext produces different ciphertext (random IV)', () => {
        const plaintext = 'GCM randomness';
        const e1 = aes.encrypt({ message: plaintext, secret: SECRET_32 });
        const e2 = aes.encrypt({ message: plaintext, secret: SECRET_32 });
        expect(e1).not.toBe(e2);
      });

      test('TC-031: decrypt with wrong secret should throw', () => {
        const encrypted = aes.encrypt({ message: 'GCM secret', secret: SECRET_32 });
        expect(() => aes.decrypt({ message: encrypted, secret: 'wrong-key' })).toThrow();
      });

      test('TC-032: decrypt wrong secret with doThrow=false returns original', () => {
        const encrypted = aes.encrypt({ message: 'GCM no throw', secret: SECRET_32 });
        const result = aes.decrypt({
          message: encrypted,
          secret: 'wrong-key',
          opts: { doThrow: false },
        });
        expect(result).toBe(encrypted);
      });

      test('TC-033: encrypt/decrypt unicode content in GCM', () => {
        const plaintext = '안녕하세요 🎉 Ω≈ç√∫';
        const encrypted = aes.encrypt({ message: plaintext, secret: SECRET_32 });
        const decrypted = aes.decrypt({ message: encrypted, secret: SECRET_32 });
        expect(decrypted).toBe(plaintext);
      });

      test('TC-034: encrypt/decrypt empty string in GCM', () => {
        const encrypted = aes.encrypt({ message: '', secret: SECRET_32 });
        const decrypted = aes.decrypt({ message: encrypted, secret: SECRET_32 });
        expect(decrypted).toBe('');
      });

      test('TC-035: encrypt/decrypt with explicit IV in GCM', () => {
        const plaintext = 'explicit iv gcm';
        const iv = C.randomBytes(16);
        const encrypted = aes.encrypt({ message: plaintext, secret: SECRET_32, opts: { iv } });
        const decrypted = aes.decrypt({ message: encrypted, secret: SECRET_32, opts: { iv } });
        expect(decrypted).toBe(plaintext);
      });

      test('TC-036: encrypt/decrypt with hex encoding in GCM', () => {
        const plaintext = 'hex gcm test';
        const encrypted = aes.encrypt({
          message: plaintext,
          secret: SECRET_32,
          opts: { outputEncoding: 'hex' },
        });
        const decrypted = aes.decrypt({
          message: encrypted,
          secret: SECRET_32,
          opts: { inputEncoding: 'hex' },
        });
        expect(decrypted).toBe(plaintext);
      });
    });

    // -------------------------------------------------------------------------
    // Cross-algorithm isolation
    // -------------------------------------------------------------------------

    describe('Cross-algorithm Isolation', () => {
      test('TC-037: CBC ciphertext cannot be decrypted by GCM', () => {
        const cbc = AES.withAlgorithm('aes-256-cbc');
        const gcm = AES.withAlgorithm('aes-256-gcm');

        const encrypted = cbc.encrypt({ message: 'cross test', secret: SECRET_32 });
        expect(() => gcm.decrypt({ message: encrypted, secret: SECRET_32 })).toThrow();
      });

      test('TC-038: GCM ciphertext cannot be decrypted by CBC', () => {
        const cbc = AES.withAlgorithm('aes-256-cbc');
        const gcm = AES.withAlgorithm('aes-256-gcm');

        const encrypted = gcm.encrypt({ message: 'cross test', secret: SECRET_32 });
        expect(() => cbc.decrypt({ message: encrypted, secret: SECRET_32 })).toThrow();
      });
    });

    // -------------------------------------------------------------------------
    // File Operations
    // -------------------------------------------------------------------------

    describe('File Operations', () => {
      let aes: AES;
      let tmpDir: string;
      let tmpFilePath: string;

      beforeAll(() => {
        aes = AES.withAlgorithm('aes-256-cbc');
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ignis-crypto-test-'));
        tmpFilePath = path.join(tmpDir, 'test-file.txt');
      });

      test('TC-039: encryptFile/decryptFile roundtrip', () => {
        const content = 'File encryption test content\nwith multiple lines\nand unicode: 日本語';
        fs.writeFileSync(tmpFilePath, content, 'utf-8');

        const encrypted = aes.encryptFile({ absolutePath: tmpFilePath, secret: SECRET_32 });
        expect(encrypted).not.toBe(content);
        expect(encrypted.length).toBeGreaterThan(0);

        // Write encrypted content and decrypt
        const encryptedFilePath = path.join(tmpDir, 'encrypted.txt');
        fs.writeFileSync(encryptedFilePath, encrypted, 'utf-8');

        const decrypted = aes.decryptFile({ absolutePath: encryptedFilePath, secret: SECRET_32 });
        expect(decrypted).toBe(content);
      });

      test('TC-040: encryptFile with empty path returns empty string', () => {
        expect(aes.encryptFile({ absolutePath: '', secret: SECRET_32 })).toBe('');
      });

      test('TC-041: decryptFile with empty path returns empty string', () => {
        expect(aes.decryptFile({ absolutePath: '', secret: SECRET_32 })).toBe('');
      });

      test('TC-042: encryptFile with JSON file content', () => {
        const jsonContent = JSON.stringify({ key: 'value', nested: { arr: [1, 2, 3] } });
        const jsonPath = path.join(tmpDir, 'test.json');
        fs.writeFileSync(jsonPath, jsonContent, 'utf-8');

        const encrypted = aes.encryptFile({ absolutePath: jsonPath, secret: SECRET_32 });

        const encPath = path.join(tmpDir, 'test.json.enc');
        fs.writeFileSync(encPath, encrypted, 'utf-8');

        const decrypted = aes.decryptFile({ absolutePath: encPath, secret: SECRET_32 });
        expect(JSON.parse(decrypted)).toEqual(JSON.parse(jsonContent));
      });
    });
  });

  // ===========================================================================
  // RSA
  // ===========================================================================

  describe('RSA', () => {
    let rsa: RSA;
    let keyPair: { publicKey: Buffer; privateKey: Buffer };

    beforeAll(() => {
      rsa = RSA.withAlgorithm();
      keyPair = rsa.generateDERKeyPair();
    });

    // -------------------------------------------------------------------------
    // Factory & Key Generation
    // -------------------------------------------------------------------------

    describe('Factory & Key Generation', () => {
      test('TC-043: withAlgorithm creates RSA instance', () => {
        expect(rsa).toBeInstanceOf(RSA);
        expect(rsa.algorithm).toBe('rsa');
      });

      test('TC-044: generateDERKeyPair returns public and private keys', () => {
        expect(keyPair.publicKey).toBeInstanceOf(Buffer);
        expect(keyPair.privateKey).toBeInstanceOf(Buffer);
        expect(keyPair.publicKey.length).toBeGreaterThan(0);
        expect(keyPair.privateKey.length).toBeGreaterThan(0);
      });

      test('TC-045: generateDERKeyPair with default modulus (2048)', () => {
        const keys = rsa.generateDERKeyPair();
        // 2048-bit DER public key is roughly 294 bytes
        expect(keys.publicKey.length).toBeGreaterThan(200);
      });

      test('TC-046: generateDERKeyPair with custom modulus (1024)', () => {
        const keys = rsa.generateDERKeyPair({ modulus: 1024 });
        // 1024-bit key is smaller than 2048-bit
        expect(keys.publicKey.length).toBeLessThan(keyPair.publicKey.length);
      });

      test('TC-047: each key pair is unique', () => {
        const keys2 = rsa.generateDERKeyPair();
        expect(keys2.publicKey.equals(keyPair.publicKey)).toBe(false);
        expect(keys2.privateKey.equals(keyPair.privateKey)).toBe(false);
      });
    });

    // -------------------------------------------------------------------------
    // Encrypt / Decrypt
    // -------------------------------------------------------------------------

    describe('Encrypt / Decrypt', () => {
      let pubKeyB64: string;
      let privKeyB64: string;

      beforeAll(() => {
        pubKeyB64 = keyPair.publicKey.toString('base64');
        privKeyB64 = keyPair.privateKey.toString('base64');
      });

      test('TC-048: encrypt/decrypt roundtrip with default options', () => {
        const plaintext = 'RSA roundtrip test';
        const encrypted = rsa.encrypt({ message: plaintext, secret: pubKeyB64 });
        expect(encrypted).not.toBe(plaintext);

        const decrypted = rsa.decrypt({ message: encrypted, secret: privKeyB64 });
        expect(decrypted).toBe(plaintext);
      });

      test('TC-049: encrypt/decrypt short message', () => {
        const plaintext = 'Hi';
        const encrypted = rsa.encrypt({ message: plaintext, secret: pubKeyB64 });
        const decrypted = rsa.decrypt({ message: encrypted, secret: privKeyB64 });
        expect(decrypted).toBe(plaintext);
      });

      test('TC-050: encrypt/decrypt unicode message', () => {
        const plaintext = '🔑 Clé secrète 密钥';
        const encrypted = rsa.encrypt({ message: plaintext, secret: pubKeyB64 });
        const decrypted = rsa.decrypt({ message: encrypted, secret: privKeyB64 });
        expect(decrypted).toBe(plaintext);
      });

      test('TC-051: same plaintext produces different ciphertext (OAEP padding)', () => {
        const plaintext = 'RSA randomness';
        const e1 = rsa.encrypt({ message: plaintext, secret: pubKeyB64 });
        const e2 = rsa.encrypt({ message: plaintext, secret: pubKeyB64 });
        expect(e1).not.toBe(e2);
      });

      test('TC-052: decrypt with wrong private key should throw', () => {
        const otherKeys = rsa.generateDERKeyPair();
        const wrongPrivKey = otherKeys.privateKey.toString('base64');

        const encrypted = rsa.encrypt({ message: 'wrong key test', secret: pubKeyB64 });
        expect(() => rsa.decrypt({ message: encrypted, secret: wrongPrivKey })).toThrow();
      });

      test('TC-053: decrypt with wrong key and doThrow=false returns original', () => {
        const otherKeys = rsa.generateDERKeyPair();
        const wrongPrivKey = otherKeys.privateKey.toString('base64');

        const encrypted = rsa.encrypt({ message: 'no throw test', secret: pubKeyB64 });
        const result = rsa.decrypt({
          message: encrypted,
          secret: wrongPrivKey,
          opts: { doThrow: false },
        });
        expect(result).toBe(encrypted);
      });

      test('TC-054: encrypt with invalid key and doThrow=false returns original', () => {
        const result = rsa.encrypt({
          message: 'bad key',
          secret: 'not-a-real-key',
          opts: { doThrow: false },
        });
        expect(result).toBe('bad key');
      });

      test('TC-055: encrypt with invalid key and doThrow=true (default) throws', () => {
        expect(() => rsa.encrypt({ message: 'bad key', secret: 'not-a-real-key' })).toThrow();
      });

      test('TC-056: encrypt/decrypt with hex encoding', () => {
        const plaintext = 'hex encoding rsa';
        const encrypted = rsa.encrypt({
          message: plaintext,
          secret: pubKeyB64,
          opts: { outputEncoding: 'hex' },
        });
        const decrypted = rsa.decrypt({
          message: encrypted,
          secret: privKeyB64,
          opts: {
            inputEncoding: { key: 'base64', message: 'hex' },
            outputEncoding: 'utf-8',
          },
        });
        expect(decrypted).toBe(plaintext);
      });

      test('TC-057: encrypt/decrypt JSON payload', () => {
        const payload = JSON.stringify({ token: 'abc123', role: 'admin' });
        const encrypted = rsa.encrypt({ message: payload, secret: pubKeyB64 });
        const decrypted = rsa.decrypt({ message: encrypted, secret: privKeyB64 });
        expect(JSON.parse(decrypted)).toEqual(JSON.parse(payload));
      });
    });
  });

  // ===========================================================================
  // ECDH
  // ===========================================================================

  describe('ECDH', () => {
    // -------------------------------------------------------------------------
    // Factory
    // -------------------------------------------------------------------------

    describe('Factory', () => {
      test('TC-058: withAlgorithm creates ECDH instance with default options', () => {
        const ecdh = ECDH.withAlgorithm();
        expect(ecdh).toBeInstanceOf(ECDH);
        expect(ecdh.algorithm).toBe('ecdh-p256');
      });

      test('TC-059: withAlgorithm accepts custom hkdfInfo', () => {
        const ecdh = ECDH.withAlgorithm({ hkdfInfo: 'custom-info' });
        expect(ecdh).toBeInstanceOf(ECDH);
        expect(ecdh.algorithm).toBe('ecdh-p256');
      });

      test('TC-060: constructor without arguments creates valid instance', () => {
        const ecdh = new ECDH();
        expect(ecdh.algorithm).toBe('ecdh-p256');
      });
    });

    // -------------------------------------------------------------------------
    // Key Generation
    // -------------------------------------------------------------------------

    describe('Key Generation', () => {
      let ecdh: ECDH;

      beforeAll(() => {
        ecdh = ECDH.withAlgorithm();
      });

      test('TC-061: generateKeyPair returns keyPair and publicKeyB64', async () => {
        const result = await ecdh.generateKeyPair();
        expect(result.keyPair).toBeDefined();
        expect(result.keyPair.publicKey).toBeDefined();
        expect(result.keyPair.privateKey).toBeDefined();
        expect(typeof result.publicKeyB64).toBe('string');
        expect(result.publicKeyB64.length).toBeGreaterThan(0);
      });

      test('TC-062: each key pair is unique', async () => {
        const kp1 = await ecdh.generateKeyPair();
        const kp2 = await ecdh.generateKeyPair();
        expect(kp1.publicKeyB64).not.toBe(kp2.publicKeyB64);
      });

      test('TC-063: publicKeyB64 is valid base64', async () => {
        const { publicKeyB64 } = await ecdh.generateKeyPair();
        const decoded = Buffer.from(publicKeyB64, 'base64');
        // P-256 uncompressed public key = 65 bytes (0x04 + 32 + 32)
        expect(decoded.length).toBe(65);
      });
    });

    // -------------------------------------------------------------------------
    // Key Import
    // -------------------------------------------------------------------------

    describe('Key Import', () => {
      let ecdh: ECDH;

      beforeAll(() => {
        ecdh = ECDH.withAlgorithm();
      });

      test('TC-064: importPublicKey roundtrip (export then import)', async () => {
        const { publicKeyB64 } = await ecdh.generateKeyPair();
        const imported = await ecdh.importPublicKey({ rawKeyB64: publicKeyB64 });
        expect(imported).toBeDefined();
        expect(imported.type).toBe('public');
      });

      test('TC-065: importPublicKey with invalid base64 should throw', async () => {
        await expect(ecdh.importPublicKey({ rawKeyB64: 'not-valid-key' })).rejects.toThrow();
      });
    });

    // -------------------------------------------------------------------------
    // Key Derivation
    // -------------------------------------------------------------------------

    describe('Key Derivation', () => {
      let ecdh: ECDH;

      beforeAll(() => {
        ecdh = ECDH.withAlgorithm();
      });

      test('TC-066: deriveAESKey produces a CryptoKey for AES-GCM', async () => {
        const alice = await ecdh.generateKeyPair();
        const bob = await ecdh.generateKeyPair();

        const bobPub = await ecdh.importPublicKey({ rawKeyB64: bob.publicKeyB64 });
        const key = await ecdh.deriveAESKey({
          privateKey: alice.keyPair.privateKey,
          peerPublicKey: bobPub,
        });

        expect(key).toBeDefined();
        expect(key.type).toBe('secret');
      });

      test('TC-067: symmetric derivation — Alice→Bob and Bob→Alice produce same key', async () => {
        const alice = await ecdh.generateKeyPair();
        const bob = await ecdh.generateKeyPair();

        const bobPubImported = await ecdh.importPublicKey({ rawKeyB64: bob.publicKeyB64 });
        const alicePubImported = await ecdh.importPublicKey({ rawKeyB64: alice.publicKeyB64 });

        const keyAB = await ecdh.deriveAESKey({
          privateKey: alice.keyPair.privateKey,
          peerPublicKey: bobPubImported,
        });
        const keyBA = await ecdh.deriveAESKey({
          privateKey: bob.keyPair.privateKey,
          peerPublicKey: alicePubImported,
        });

        // Encrypt with one, decrypt with the other to prove equivalence
        const plaintext = 'symmetric derivation proof';
        const encrypted = await ecdh.encrypt({ message: plaintext, secret: keyAB });
        const decrypted = await ecdh.decrypt({ message: encrypted, secret: keyBA });
        expect(decrypted).toBe(plaintext);
      });
    });

    // -------------------------------------------------------------------------
    // Encrypt / Decrypt
    // -------------------------------------------------------------------------

    describe('Encrypt / Decrypt', () => {
      let ecdh: ECDH;
      let sharedKey: CryptoKey;

      beforeAll(async () => {
        ecdh = ECDH.withAlgorithm();
        const alice = await ecdh.generateKeyPair();
        const bob = await ecdh.generateKeyPair();
        const bobPub = await ecdh.importPublicKey({ rawKeyB64: bob.publicKeyB64 });
        sharedKey = await ecdh.deriveAESKey({
          privateKey: alice.keyPair.privateKey,
          peerPublicKey: bobPub,
        });
      });

      test('TC-068: encrypt/decrypt roundtrip', async () => {
        const plaintext = 'ECDH encrypted message';
        const encrypted = await ecdh.encrypt({ message: plaintext, secret: sharedKey });
        expect(encrypted.iv).toBeDefined();
        expect(encrypted.ct).toBeDefined();

        const decrypted = await ecdh.decrypt({ message: encrypted, secret: sharedKey });
        expect(decrypted).toBe(plaintext);
      });

      test('TC-069: encrypted payload has iv and ct as base64 strings', async () => {
        const encrypted = await ecdh.encrypt({ message: 'format check', secret: sharedKey });
        expect(typeof encrypted.iv).toBe('string');
        expect(typeof encrypted.ct).toBe('string');

        // IV should be 12 bytes → 16 chars in base64
        const ivBytes = Buffer.from(encrypted.iv, 'base64');
        expect(ivBytes.length).toBe(12);
      });

      test('TC-070: same plaintext produces different ciphertext (random IV)', async () => {
        const plaintext = 'ECDH randomness';
        const e1 = await ecdh.encrypt({ message: plaintext, secret: sharedKey });
        const e2 = await ecdh.encrypt({ message: plaintext, secret: sharedKey });
        expect(e1.iv).not.toBe(e2.iv);
        expect(e1.ct).not.toBe(e2.ct);
      });

      test('TC-071: decrypt with wrong key should throw', async () => {
        const charlie = await ecdh.generateKeyPair();
        const dave = await ecdh.generateKeyPair();
        const davePub = await ecdh.importPublicKey({ rawKeyB64: dave.publicKeyB64 });
        const wrongKey = await ecdh.deriveAESKey({
          privateKey: charlie.keyPair.privateKey,
          peerPublicKey: davePub,
        });

        const encrypted = await ecdh.encrypt({ message: 'wrong key test', secret: sharedKey });
        await expect(ecdh.decrypt({ message: encrypted, secret: wrongKey })).rejects.toThrow();
      });

      test('TC-072: decrypt tampered ciphertext should throw', async () => {
        const encrypted = await ecdh.encrypt({ message: 'tamper test', secret: sharedKey });

        // Tamper with the ciphertext
        const ctBuf = Buffer.from(encrypted.ct, 'base64');
        ctBuf[0] ^= 0xff;
        const tampered: IECDHEncryptedPayload = {
          iv: encrypted.iv,
          ct: ctBuf.toString('base64'),
        };

        await expect(ecdh.decrypt({ message: tampered, secret: sharedKey })).rejects.toThrow();
      });

      test('TC-073: encrypt/decrypt empty string', async () => {
        const encrypted = await ecdh.encrypt({ message: '', secret: sharedKey });
        const decrypted = await ecdh.decrypt({ message: encrypted, secret: sharedKey });
        expect(decrypted).toBe('');
      });

      test('TC-074: encrypt/decrypt unicode content', async () => {
        const plaintext = '🔐 Привет Мир 加密 テスト';
        const encrypted = await ecdh.encrypt({ message: plaintext, secret: sharedKey });
        const decrypted = await ecdh.decrypt({ message: encrypted, secret: sharedKey });
        expect(decrypted).toBe(plaintext);
      });

      test('TC-075: encrypt/decrypt large message (10KB)', async () => {
        const plaintext = 'B'.repeat(10 * 1024);
        const encrypted = await ecdh.encrypt({ message: plaintext, secret: sharedKey });
        const decrypted = await ecdh.decrypt({ message: encrypted, secret: sharedKey });
        expect(decrypted).toBe(plaintext);
      });

      test('TC-076: encrypt/decrypt JSON payload', async () => {
        const payload = JSON.stringify({ session: 'xyz', data: [1, 2, 3] });
        const encrypted = await ecdh.encrypt({ message: payload, secret: sharedKey });
        const decrypted = await ecdh.decrypt({ message: encrypted, secret: sharedKey });
        expect(JSON.parse(decrypted)).toEqual(JSON.parse(payload));
      });
    });

    // -------------------------------------------------------------------------
    // Full Key Exchange Flow (Alice ↔ Bob)
    // -------------------------------------------------------------------------

    describe('Full Key Exchange Flow', () => {
      test('TC-077: complete Alice→Bob key exchange and bidirectional messaging', async () => {
        const ecdh = ECDH.withAlgorithm();

        // 1. Both parties generate key pairs
        const alice = await ecdh.generateKeyPair();
        const bob = await ecdh.generateKeyPair();

        // 2. Exchange public keys and import
        const alicePubForBob = await ecdh.importPublicKey({ rawKeyB64: alice.publicKeyB64 });
        const bobPubForAlice = await ecdh.importPublicKey({ rawKeyB64: bob.publicKeyB64 });

        // 3. Derive shared keys
        const aliceKey = await ecdh.deriveAESKey({
          privateKey: alice.keyPair.privateKey,
          peerPublicKey: bobPubForAlice,
        });
        const bobKey = await ecdh.deriveAESKey({
          privateKey: bob.keyPair.privateKey,
          peerPublicKey: alicePubForBob,
        });

        // 4. Alice sends to Bob
        const aliceMsg = 'Hello Bob, this is Alice!';
        const encrypted = await ecdh.encrypt({ message: aliceMsg, secret: aliceKey });
        const bobReceives = await ecdh.decrypt({ message: encrypted, secret: bobKey });
        expect(bobReceives).toBe(aliceMsg);

        // 5. Bob replies to Alice
        const bobMsg = 'Hello Alice, this is Bob!';
        const bobEncrypted = await ecdh.encrypt({ message: bobMsg, secret: bobKey });
        const aliceReceives = await ecdh.decrypt({ message: bobEncrypted, secret: aliceKey });
        expect(aliceReceives).toBe(bobMsg);
      });

      test('TC-078: different hkdfInfo produces incompatible keys', async () => {
        const ecdh1 = ECDH.withAlgorithm({ hkdfInfo: 'app-1' });
        const ecdh2 = ECDH.withAlgorithm({ hkdfInfo: 'app-2' });

        const alice = await ecdh1.generateKeyPair();
        const bob = await ecdh1.generateKeyPair();

        // Import bob's pub key in both instances
        const bobPub1 = await ecdh1.importPublicKey({ rawKeyB64: bob.publicKeyB64 });
        const bobPub2 = await ecdh2.importPublicKey({ rawKeyB64: bob.publicKeyB64 });
        const alicePub1 = await ecdh1.importPublicKey({ rawKeyB64: alice.publicKeyB64 });

        // Derive with different hkdfInfo
        const key1 = await ecdh1.deriveAESKey({
          privateKey: alice.keyPair.privateKey,
          peerPublicKey: bobPub1,
        });
        const key2 = await ecdh2.deriveAESKey({
          privateKey: alice.keyPair.privateKey,
          peerPublicKey: bobPub2,
        });
        const bobKey1 = await ecdh1.deriveAESKey({
          privateKey: bob.keyPair.privateKey,
          peerPublicKey: alicePub1,
        });

        // Encrypt with key1, try decrypt with key2 — should fail
        const encrypted = await ecdh1.encrypt({ message: 'hkdf test', secret: key1 });
        await expect(ecdh2.decrypt({ message: encrypted, secret: key2 })).rejects.toThrow();

        // But key1 and bobKey1 (same hkdfInfo) should work
        const decrypted = await ecdh1.decrypt({ message: encrypted, secret: bobKey1 });
        expect(decrypted).toBe('hkdf test');
      });

      test('TC-079: third party cannot decrypt without shared secret', async () => {
        const ecdh = ECDH.withAlgorithm();

        const alice = await ecdh.generateKeyPair();
        const bob = await ecdh.generateKeyPair();
        const eve = await ecdh.generateKeyPair();

        const bobPub = await ecdh.importPublicKey({ rawKeyB64: bob.publicKeyB64 });
        const alicePub = await ecdh.importPublicKey({ rawKeyB64: alice.publicKeyB64 });

        // Eve tries to derive a key with Alice's public key
        const evePub = await ecdh.importPublicKey({ rawKeyB64: eve.publicKeyB64 });
        const eveKey = await ecdh.deriveAESKey({
          privateKey: eve.keyPair.privateKey,
          peerPublicKey: alicePub,
        });

        // Alice encrypts for Bob
        const aliceKey = await ecdh.deriveAESKey({
          privateKey: alice.keyPair.privateKey,
          peerPublicKey: bobPub,
        });
        const encrypted = await ecdh.encrypt({ message: 'secret for bob', secret: aliceKey });

        // Eve cannot decrypt
        await expect(ecdh.decrypt({ message: encrypted, secret: eveKey })).rejects.toThrow();
      });
    });
  });
});
