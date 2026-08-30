/** Crypto Algorithms Test Suite */

import { describe, test, expect, beforeAll } from 'bun:test';
import C from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AES, RSA, ECDH } from '@/modules/crypto/algorithms';
import type { IECDHEncryptedPayload } from '@/modules/crypto/algorithms';

const SECRET_32 = 'abcdefghijklmnopqrstuvwxyz012345'; // exactly 32 chars
const SECRET_SHORT = 'short';
const SECRET_LONG = 'this-secret-is-longer-than-thirty-two-characters-definitely';

describe('Crypto Algorithms', () => {
  describe('BaseCryptoAlgorithm', () => {
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

    describe('normalizeSecretKey (PBKDF2)', () => {
      let aes: AES;

      beforeAll(() => {
        aes = AES.withAlgorithm('aes-256-cbc');
      });

      test('TC-004: derives a Buffer of the requested length from a short secret', () => {
        const result = aes['normalizeSecretKey']({ secret: 'abc', length: 8 });
        expect(Buffer.isBuffer(result)).toBe(true);
        expect(result.length).toBe(8);
      });

      test('TC-005: derives full length from a long secret (no truncation)', () => {
        const result = aes['normalizeSecretKey']({ secret: SECRET_LONG, length: 32 });
        expect(result.length).toBe(32);
      });

      test('TC-006: derivation is deterministic for same secret + length', () => {
        const a = aes['normalizeSecretKey']({ secret: SECRET_32, length: 32 });
        const b = aes['normalizeSecretKey']({ secret: SECRET_32, length: 32 });
        expect(a.equals(b)).toBe(true);
      });

      test('TC-007: different secrets derive different keys', () => {
        const a = aes['normalizeSecretKey']({ secret: 'secret-a', length: 32 });
        const b = aes['normalizeSecretKey']({ secret: 'secret-b', length: 32 });
        expect(a.equals(b)).toBe(false);
      });

      test('TC-008: handles empty secret (still derives requested length)', () => {
        const result = aes['normalizeSecretKey']({ secret: '', length: 4 });
        expect(result.length).toBe(4);
      });

      test('TC-008b: derived key is NOT the raw secret bytes (padEnd removed)', () => {
        const result = aes['normalizeSecretKey']({ secret: SECRET_32, length: 32 });
        // Legacy padEnd returned the secret verbatim; PBKDF2 must not.
        expect(result.toString('utf-8')).not.toBe(SECRET_32);
      });
    });

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

  describe('AES', () => {
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

      test('TC-014: encrypt/decrypt roundtrip with short secret (PBKDF2-derived)', () => {
        const plaintext = 'pad my secret';
        const encrypted = aes.encrypt({ message: plaintext, secret: SECRET_SHORT });
        const decrypted = aes.decrypt({ message: encrypted, secret: SECRET_SHORT });
        expect(decrypted).toBe(plaintext);
      });

      test('TC-015: encrypt/decrypt roundtrip with long secret (PBKDF2-derived)', () => {
        const plaintext = 'truncate my secret';
        const encrypted = aes.encrypt({ message: plaintext, secret: SECRET_LONG });
        const decrypted = aes.decrypt({ message: encrypted, secret: SECRET_LONG });
        expect(decrypted).toBe(plaintext);
      });

      test('TC-016: encrypt/decrypt with explicit IV', () => {
        const plaintext = 'explicit iv test';
        const iv = C.randomBytes(16);
        const encrypted = aes.encrypt({ message: plaintext, secret: SECRET_32, opts: { iv } });
        // No `iv` on the way back: the envelope carries the one encrypt used.
        const decrypted = aes.decrypt({ message: encrypted, secret: SECRET_32 });
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
        const payload = JSON.stringify({
          userId: 1,
          role: 'admin',
          permissions: ['read', 'write'],
        });
        const encrypted = aes.encrypt({ message: payload, secret: SECRET_32 });
        const decrypted = aes.decrypt({ message: encrypted, secret: SECRET_32 });
        expect(JSON.parse(decrypted)).toEqual(JSON.parse(payload));
      });
    });

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
        // No `iv` on the way back: the envelope carries the one encrypt used.
        const decrypted = aes.decrypt({ message: encrypted, secret: SECRET_32 });
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

    describe('Key rotation (keyring)', () => {
      const OLD = { id: '1', secret: 'old-secret-value-for-rotation' };
      const NEW = { id: '2', secret: 'new-secret-value-for-rotation' };

      test('TC-R01: keyring decrypts data written under the current key', () => {
        const aes = AES.withAlgorithm('aes-256-gcm');
        const enc = aes.encrypt({ message: 'rotate me', secret: [OLD] });
        expect(aes.decrypt({ message: enc, secret: [OLD] })).toBe('rotate me');
      });

      test('TC-R02: after rotation, old ciphertext still decrypts and new writes use the new key', () => {
        const aes = AES.withAlgorithm('aes-256-gcm');

        // Written before rotation (current key = OLD, tagged id "1").
        const legacy = aes.encrypt({ message: 'legacy data', secret: [OLD] });

        // Rotate: NEW becomes current (keyring[0]); OLD retained so old data still reads.
        const keyring = [NEW, OLD];

        expect(aes.decrypt({ message: legacy, secret: keyring })).toBe('legacy data');

        const fresh = aes.encrypt({ message: 'fresh data', secret: keyring });
        expect(aes.decrypt({ message: fresh, secret: keyring })).toBe('fresh data');
      });

      test('TC-R03: a keyring missing the ciphertext key id throws', () => {
        const aes = AES.withAlgorithm('aes-256-gcm');
        const enc = aes.encrypt({ message: 'orphan', secret: [OLD] }); // tagged id "1"
        expect(() => aes.decrypt({ message: enc, secret: [NEW] })).toThrow();
      });

      test('TC-R04: a bare string secret still works (single-key mode)', () => {
        const aes = AES.withAlgorithm('aes-256-cbc');
        const enc = aes.encrypt({ message: 'single key', secret: 'plain-secret' });
        expect(aes.decrypt({ message: enc, secret: 'plain-secret' })).toBe('single key');
      });
    });

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

  describe('RSA', () => {
    let rsa: RSA;
    let keyPair: { publicKey: Buffer; privateKey: Buffer };

    beforeAll(() => {
      rsa = RSA.withAlgorithm();
      keyPair = rsa.generateDERKeyPair();
    });

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

      test('TC-046: a modulus below 2048 is rejected, not generated', () => {
        expect(() => rsa.generateDERKeyPair({ modulus: 1024 })).toThrow();
      });

      test('TC-046b: the rejection names the size and the floor, so a caller can act on it', () => {
        let caught: unknown;
        try {
          rsa.generateDERKeyPair({ modulus: 512 });
        } catch (error) {
          caught = error;
        }

        expect((caught as Error).message).toContain('512');
        expect((caught as Error).message).toContain('2048');
      });

      test('TC-046c: a modulus above the floor is still accepted', () => {
        const keys = rsa.generateDERKeyPair({ modulus: 3072 });
        expect(keys.publicKey.length).toBeGreaterThan(keyPair.publicKey.length);
      });

      test('TC-047: each key pair is unique', () => {
        const keys2 = rsa.generateDERKeyPair();
        expect(keys2.publicKey.equals(keyPair.publicKey)).toBe(false);
        expect(keys2.privateKey.equals(keyPair.privateKey)).toBe(false);
      });
    });

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

  describe('ECDH', () => {
    describe('Factory', () => {
      test('TC-058: withAlgorithm creates ECDH instance with default options', () => {
        const ecdh = ECDH.withAlgorithm();
        expect(ecdh).toBeInstanceOf(ECDH);
        expect(ecdh.algorithm).toBe('ecdh-p256');
      });

      test('TC-059: withAlgorithm accepts custom hkdfInfo', () => {
        const ecdh = ECDH.withAlgorithm({ algorithm: 'ecdh-p256', hkdfInfo: 'custom-info' });
        expect(ecdh).toBeInstanceOf(ECDH);
        expect(ecdh.algorithm).toBe('ecdh-p256');
      });

      test('TC-060: constructor without arguments creates valid instance', () => {
        const ecdh = new ECDH();
        expect(ecdh.algorithm).toBe('ecdh-p256');
      });
    });

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
        expect(ecdh.importPublicKey({ rawKeyB64: 'not-valid-key' })).rejects.toThrow();
      });
    });

    describe('Key Derivation', () => {
      let ecdh: ECDH;

      beforeAll(() => {
        ecdh = ECDH.withAlgorithm();
      });

      test('TC-066: deriveAESKey produces a CryptoKey and salt', async () => {
        const alice = await ecdh.generateKeyPair();
        const bob = await ecdh.generateKeyPair();

        const bobPub = await ecdh.importPublicKey({ rawKeyB64: bob.publicKeyB64 });
        const { key, salt } = await ecdh.deriveAESKey({
          privateKey: alice.keyPair.privateKey,
          peerPublicKey: bobPub,
        });

        expect(key).toBeDefined();
        expect(key.type).toBe('secret');
        expect(typeof salt).toBe('string');
        expect(salt.length).toBeGreaterThan(0);
      });

      test('TC-067: symmetric derivation — Alice→Bob and Bob→Alice produce same key', async () => {
        const alice = await ecdh.generateKeyPair();
        const bob = await ecdh.generateKeyPair();

        const bobPubImported = await ecdh.importPublicKey({ rawKeyB64: bob.publicKeyB64 });
        const alicePubImported = await ecdh.importPublicKey({ rawKeyB64: alice.publicKeyB64 });

        const { key: keyAB, salt } = await ecdh.deriveAESKey({
          privateKey: alice.keyPair.privateKey,
          peerPublicKey: bobPubImported,
        });
        const { key: keyBA } = await ecdh.deriveAESKey({
          privateKey: bob.keyPair.privateKey,
          peerPublicKey: alicePubImported,
          salt,
        });

        // Encrypt with one, decrypt with the other to prove equivalence
        const plaintext = 'symmetric derivation proof';
        const encrypted = await ecdh.encrypt({ message: plaintext, secret: keyAB });
        const decrypted = await ecdh.decrypt({ message: encrypted, secret: keyBA });
        expect(decrypted).toBe(plaintext);
      });
    });

    describe('Encrypt / Decrypt', () => {
      let ecdh: ECDH;
      let sharedKey: CryptoKey;

      beforeAll(async () => {
        ecdh = ECDH.withAlgorithm();
        const alice = await ecdh.generateKeyPair();
        const bob = await ecdh.generateKeyPair();
        const bobPub = await ecdh.importPublicKey({ rawKeyB64: bob.publicKeyB64 });
        const derived = await ecdh.deriveAESKey({
          privateKey: alice.keyPair.privateKey,
          peerPublicKey: bobPub,
        });
        sharedKey = derived.key;
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
        const { key: wrongKey } = await ecdh.deriveAESKey({
          privateKey: charlie.keyPair.privateKey,
          peerPublicKey: davePub,
        });

        const encrypted = await ecdh.encrypt({ message: 'wrong key test', secret: sharedKey });
        expect(ecdh.decrypt({ message: encrypted, secret: wrongKey })).rejects.toThrow();
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

        expect(ecdh.decrypt({ message: tampered, secret: sharedKey })).rejects.toThrow();
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

    describe('Full Key Exchange Flow', () => {
      test('TC-077: complete Alice→Bob key exchange and bidirectional messaging', async () => {
        const ecdh = ECDH.withAlgorithm();

        // 1. Both parties generate key pairs
        const alice = await ecdh.generateKeyPair();
        const bob = await ecdh.generateKeyPair();

        // 2. Exchange public keys and import
        const alicePubForBob = await ecdh.importPublicKey({ rawKeyB64: alice.publicKeyB64 });
        const bobPubForAlice = await ecdh.importPublicKey({ rawKeyB64: bob.publicKeyB64 });

        // 3. Derive shared keys (initiator generates salt, responder uses it)
        const { key: aliceKey, salt } = await ecdh.deriveAESKey({
          privateKey: alice.keyPair.privateKey,
          peerPublicKey: bobPubForAlice,
        });
        const { key: bobKey } = await ecdh.deriveAESKey({
          privateKey: bob.keyPair.privateKey,
          peerPublicKey: alicePubForBob,
          salt,
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
        const ecdh1 = ECDH.withAlgorithm({ algorithm: 'ecdh-p256', hkdfInfo: 'app-1' });
        const ecdh2 = ECDH.withAlgorithm({ algorithm: 'ecdh-p256', hkdfInfo: 'app-2' });

        const alice = await ecdh1.generateKeyPair();
        const bob = await ecdh1.generateKeyPair();

        // Import bob's pub key in both instances
        const bobPub1 = await ecdh1.importPublicKey({ rawKeyB64: bob.publicKeyB64 });
        const bobPub2 = await ecdh2.importPublicKey({ rawKeyB64: bob.publicKeyB64 });
        const alicePub1 = await ecdh1.importPublicKey({ rawKeyB64: alice.publicKeyB64 });

        // Derive with different hkdfInfo but same salt
        const { key: key1, salt: salt1 } = await ecdh1.deriveAESKey({
          privateKey: alice.keyPair.privateKey,
          peerPublicKey: bobPub1,
        });
        const { key: key2 } = await ecdh2.deriveAESKey({
          privateKey: alice.keyPair.privateKey,
          peerPublicKey: bobPub2,
          salt: salt1,
        });
        const { key: bobKey1 } = await ecdh1.deriveAESKey({
          privateKey: bob.keyPair.privateKey,
          peerPublicKey: alicePub1,
          salt: salt1,
        });

        // Encrypt with key1, try decrypt with key2 - should fail (different hkdfInfo)
        const encrypted = await ecdh1.encrypt({ message: 'hkdf test', secret: key1 });
        expect(ecdh2.decrypt({ message: encrypted, secret: key2 })).rejects.toThrow();

        // But key1 and bobKey1 (same hkdfInfo + same salt) should work
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
        const { key: eveKey } = await ecdh.deriveAESKey({
          privateKey: eve.keyPair.privateKey,
          peerPublicKey: alicePub,
        });

        // Alice encrypts for Bob
        const { key: aliceKey } = await ecdh.deriveAESKey({
          privateKey: alice.keyPair.privateKey,
          peerPublicKey: bobPub,
        });
        const encrypted = await ecdh.encrypt({ message: 'secret for bob', secret: aliceKey });

        // Eve cannot decrypt
        expect(ecdh.decrypt({ message: encrypted, secret: eveKey })).rejects.toThrow();
      });
    });

    describe('Salt-based Key Derivation', () => {
      let ecdh: ECDH;

      beforeAll(() => {
        ecdh = ECDH.withAlgorithm();
      });

      test('TC-080: salt roundtrip — initiator salt used by responder yields same key', async () => {
        const alice = await ecdh.generateKeyPair();
        const bob = await ecdh.generateKeyPair();
        const bobPub = await ecdh.importPublicKey({ rawKeyB64: bob.publicKeyB64 });
        const alicePub = await ecdh.importPublicKey({ rawKeyB64: alice.publicKeyB64 });

        // Initiator generates salt
        const { key: aliceKey, salt } = await ecdh.deriveAESKey({
          privateKey: alice.keyPair.privateKey,
          peerPublicKey: bobPub,
        });

        // Responder uses the same salt
        const { key: bobKey } = await ecdh.deriveAESKey({
          privateKey: bob.keyPair.privateKey,
          peerPublicKey: alicePub,
          salt,
        });

        const plaintext = 'salt roundtrip test';
        const encrypted = await ecdh.encrypt({ message: plaintext, secret: aliceKey });
        const decrypted = await ecdh.decrypt({ message: encrypted, secret: bobKey });
        expect(decrypted).toBe(plaintext);
      });

      test('TC-081: different salt produces incompatible keys (same key pair)', async () => {
        const alice = await ecdh.generateKeyPair();
        const bob = await ecdh.generateKeyPair();
        const bobPub = await ecdh.importPublicKey({ rawKeyB64: bob.publicKeyB64 });

        // Two derivations without shared salt → random salts → different keys
        const { key: key1 } = await ecdh.deriveAESKey({
          privateKey: alice.keyPair.privateKey,
          peerPublicKey: bobPub,
        });
        const { key: key2 } = await ecdh.deriveAESKey({
          privateKey: alice.keyPair.privateKey,
          peerPublicKey: bobPub,
        });

        const encrypted = await ecdh.encrypt({ message: 'salt isolation', secret: key1 });
        expect(ecdh.decrypt({ message: encrypted, secret: key2 })).rejects.toThrow();
      });
    });

    describe('AAD (Additional Authenticated Data)', () => {
      let ecdh: ECDH;
      let sharedKey: CryptoKey;

      beforeAll(async () => {
        ecdh = ECDH.withAlgorithm();
        const alice = await ecdh.generateKeyPair();
        const bob = await ecdh.generateKeyPair();
        const bobPub = await ecdh.importPublicKey({ rawKeyB64: bob.publicKeyB64 });
        const derived = await ecdh.deriveAESKey({
          privateKey: alice.keyPair.privateKey,
          peerPublicKey: bobPub,
        });
        sharedKey = derived.key;
      });

      test('TC-082: encrypt with AAD, decrypt with matching AAD succeeds', async () => {
        const encrypted = await ecdh.encrypt({
          message: 'aad test',
          secret: sharedKey,
          opts: { additionalData: 'context-A' },
        });
        const decrypted = await ecdh.decrypt({
          message: encrypted,
          secret: sharedKey,
          opts: { additionalData: 'context-A' },
        });
        expect(decrypted).toBe('aad test');
      });

      test('TC-083: decrypt without AAD when encrypted with AAD throws', async () => {
        const encrypted = await ecdh.encrypt({
          message: 'aad required',
          secret: sharedKey,
          opts: { additionalData: 'context-A' },
        });
        expect(ecdh.decrypt({ message: encrypted, secret: sharedKey })).rejects.toThrow();
      });

      test('TC-084: decrypt with wrong AAD throws', async () => {
        const encrypted = await ecdh.encrypt({
          message: 'wrong aad',
          secret: sharedKey,
          opts: { additionalData: 'context-A' },
        });
        expect(
          ecdh.decrypt({
            message: encrypted,
            secret: sharedKey,
            opts: { additionalData: 'context-B' },
          }),
        ).rejects.toThrow();
      });
    });

    describe('Input Validation', () => {
      let ecdh: ECDH;
      let sharedKey: CryptoKey;

      beforeAll(async () => {
        ecdh = ECDH.withAlgorithm();
        const alice = await ecdh.generateKeyPair();
        const bob = await ecdh.generateKeyPair();
        const bobPub = await ecdh.importPublicKey({ rawKeyB64: bob.publicKeyB64 });
        const derived = await ecdh.deriveAESKey({
          privateKey: alice.keyPair.privateKey,
          peerPublicKey: bobPub,
        });
        sharedKey = derived.key;
      });

      test('TC-085: importPublicKey with malformed base64 throws validation error', async () => {
        expect(ecdh.importPublicKey({ rawKeyB64: '!!invalid!!' })).rejects.toThrow(
          'Invalid base64',
        );
      });

      test('TC-086: tampered IV causes decrypt to throw', async () => {
        const encrypted = await ecdh.encrypt({ message: 'iv tamper test', secret: sharedKey });

        const ivBuf = Buffer.from(encrypted.iv, 'base64');
        ivBuf[0] ^= 0xff;
        const tampered: IECDHEncryptedPayload = {
          iv: ivBuf.toString('base64'),
          ct: encrypted.ct,
        };

        expect(ecdh.decrypt({ message: tampered, secret: sharedKey })).rejects.toThrow();
      });
    });
  });
});

/** Two contract gaps left by the PBKDF2 envelope change. */
describe('AES contract after the envelope change', () => {
  const KEYRING_SECRET = 'abcdefghijklmnopqrstuvwxyz012345';

  test('an empty secret in the keyring is refused by name, not by an opaque crypto error', () => {
    const aes = AES.withAlgorithm('aes-256-gcm');
    const encrypted = aes.encrypt({
      message: 'payload',
      secret: [{ id: '1', secret: KEYRING_SECRET }],
    });

    let caught: unknown;
    try {
      aes.decrypt({ message: encrypted, secret: [{ id: '1', secret: '' }] });
    } catch (error) {
      caught = error;
    }

    // resolveEncryptKey already guards this; the decrypt side must say the same thing.
    expect((caught as Error).message).toContain('resolveDecryptKey');
  });

  test('decrypt takes no iv - the envelope carries it, so accepting one would be a lie', () => {
    const aes = AES.withAlgorithm('aes-256-cbc');
    const encrypted = aes.encrypt({ message: 'payload', secret: KEYRING_SECRET });

    const decrypted = aes.decrypt({
      message: encrypted,
      secret: KEYRING_SECRET,
      // @ts-expect-error `iv` is an encrypt-only option; decrypt reads it from the envelope.
      opts: { iv: Buffer.alloc(16, 7) },
    });

    // The envelope wins regardless, which is exactly why the option must not typecheck.
    expect(decrypted).toBe('payload');
  });
});

describe('kdfSalt / kdfIterations (per-deployment KDF override)', () => {
  const SECRET = 'abcdefghijklmnopqrstuvwxyz012345';
  const CUSTOM_SALT_A = 'deployment-a-salt-0123456789';
  const CUSTOM_SALT_B = 'deployment-b-salt-9876543210';

  test('KDF-001: default derivation is pinned - the shipped salt/iterations must never change', () => {
    const aes = AES.withAlgorithm('aes-256-cbc');
    const key = aes['normalizeSecretKey']({ secret: 'my-secret-passphrase', length: 32 });

    // Computed with the literal shipped values, not read from the module's own constants,
    // so a change to DEFAULT_KDF_SALT/DEFAULT_KDF_ITERATIONS fails this test.
    const expected = C.pbkdf2Sync(
      'my-secret-passphrase',
      'ignis-kdf-salt-v1',
      100_000,
      32,
      'sha256',
    );
    expect(key.equals(expected)).toBe(true);
    expect(key.toString('hex')).toBe(
      'e43a1ec1e939d4a221343c803e918dfab5934a9ac2f57f93abd70cccbdf6750c',
    );
  });

  test('KDF-002: omitting kdfSalt keeps encrypt/decrypt byte-for-byte compatible with the pre-change default', () => {
    const aes = AES.withAlgorithm('aes-256-gcm');
    const iv = Buffer.alloc(16, 9);
    const encrypted = aes.encrypt({
      message: 'legacy default payload',
      secret: SECRET,
      opts: { iv },
    });
    const decrypted = aes.decrypt({ message: encrypted, secret: SECRET });
    expect(decrypted).toBe('legacy default payload');
  });

  test('KDF-003: two different salts produce different ciphertext for the same input', () => {
    const aes = AES.withAlgorithm('aes-256-cbc');
    const iv = Buffer.alloc(16, 3);
    const encryptedA = aes.encrypt({
      message: 'same plaintext',
      secret: SECRET,
      opts: { iv, kdfSalt: CUSTOM_SALT_A },
    });
    const encryptedB = aes.encrypt({
      message: 'same plaintext',
      secret: SECRET,
      opts: { iv, kdfSalt: CUSTOM_SALT_B },
    });
    expect(encryptedA).not.toBe(encryptedB);
  });

  test('KDF-004: ciphertext decrypts only with the salt it was encrypted under', () => {
    const aes = AES.withAlgorithm('aes-256-gcm');
    const encrypted = aes.encrypt({
      message: 'isolated payload',
      secret: SECRET,
      opts: { kdfSalt: CUSTOM_SALT_A },
    });

    const decrypted = aes.decrypt({
      message: encrypted,
      secret: SECRET,
      opts: { kdfSalt: CUSTOM_SALT_A },
    });
    expect(decrypted).toBe('isolated payload');

    expect(() =>
      aes.decrypt({ message: encrypted, secret: SECRET, opts: { kdfSalt: CUSTOM_SALT_B } }),
    ).toThrow();
    // Omitting kdfSalt on decrypt falls back to the shipped default, which is also the wrong key here.
    expect(() => aes.decrypt({ message: encrypted, secret: SECRET })).toThrow();
  });

  test('KDF-005: a different kdfIterations value derives a different key', () => {
    const aes = AES.withAlgorithm('aes-256-cbc');
    const keyDefault = aes['normalizeSecretKey']({ secret: SECRET, length: 32 });
    const keyOther = aes['normalizeSecretKey']({
      secret: SECRET,
      length: 32,
      kdfIterations: 50_000,
    });
    expect(keyDefault.equals(keyOther)).toBe(false);
  });

  test('KDF-006: an empty kdfSalt is refused, not silently accepted', () => {
    const aes = AES.withAlgorithm('aes-256-cbc');
    expect(() => aes.encrypt({ message: 'x', secret: SECRET, opts: { kdfSalt: '' } })).toThrow(
      /kdfSalt/,
    );
  });

  test('KDF-007: a kdfSalt shorter than the 16-byte minimum is refused', () => {
    const aes = AES.withAlgorithm('aes-256-cbc');
    expect(() =>
      aes.encrypt({ message: 'x', secret: SECRET, opts: { kdfSalt: 'short-salt' } }),
    ).toThrow(/kdfSalt/);
  });

  test('KDF-008: a kdfSalt at exactly the 16-byte minimum is accepted', () => {
    const aes = AES.withAlgorithm('aes-256-cbc');
    const sixteenBytes = '0123456789abcdef';
    expect(sixteenBytes.length).toBe(16);
    const encrypted = aes.encrypt({
      message: 'boundary',
      secret: SECRET,
      opts: { kdfSalt: sixteenBytes },
    });
    const decrypted = aes.decrypt({
      message: encrypted,
      secret: SECRET,
      opts: { kdfSalt: sixteenBytes },
    });
    expect(decrypted).toBe('boundary');
  });

  test('KDF-009: the minimum is measured in UTF-8 bytes, not JS string length', () => {
    const aes = AES.withAlgorithm('aes-256-cbc');
    // 8 CJK characters = 24 UTF-8 bytes, well over the 16-byte minimum, despite a short .length.
    const multiByteSalt = '盐值盐值盐值盐值';
    expect(multiByteSalt.length).toBe(8);
    expect(Buffer.byteLength(multiByteSalt, 'utf-8')).toBe(24);

    const encrypted = aes.encrypt({
      message: 'multibyte salt',
      secret: SECRET,
      opts: { kdfSalt: multiByteSalt },
    });
    const decrypted = aes.decrypt({
      message: encrypted,
      secret: SECRET,
      opts: { kdfSalt: multiByteSalt },
    });
    expect(decrypted).toBe('multibyte salt');
  });
});
