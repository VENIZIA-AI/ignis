/** LegacyAES — locks the pre-PBKDF2 behavior kept for backward compatibility. */

import { describe, test, expect } from 'bun:test';
import { AES, LegacyAES } from '@/modules/crypto/algorithms';
import { Rejection } from './rejection';

const SECRET_32 = 'abcdefghijklmnopqrstuvwxyz012345'; // exactly 32 chars
const SECRET_SHORT = 'short';
const SECRET_LONG = 'this-secret-is-longer-than-thirty-two-characters-definitely';

describe('LegacyAES (backward-compat)', () => {
  describe('normalizeSecretKeyLegacy (padEnd, the OLD derivation)', () => {
    const aes = LegacyAES.withAlgorithm('aes-256-cbc');

    test('LTC-001: pads a short secret with "0" up to the target length', () => {
      const result = (aes as any).normalizeSecretKeyLegacy({ secret: 'abc', length: 8 });
      expect(result).toBe('abc00000');
    });

    test('LTC-002: truncates a long secret to the target length', () => {
      const result = (aes as any).normalizeSecretKeyLegacy({ secret: SECRET_LONG, length: 32 });
      expect(result).toBe(SECRET_LONG.slice(0, 32));
    });

    test('LTC-003: returns an exact-length secret unchanged', () => {
      const result = (aes as any).normalizeSecretKeyLegacy({ secret: SECRET_32, length: 32 });
      expect(result).toBe(SECRET_32);
    });
  });

  describe('roundtrip in the OLD iv‖[authTag]‖ciphertext format', () => {
    const algorithms = ['aes-256-cbc', 'aes-256-gcm'] as const;
    for (const algorithm of algorithms) {
      test(`LTC-004/${algorithm}: encrypt/decrypt roundtrip`, async () => {
        const aes = LegacyAES.withAlgorithm(algorithm);
        const plaintext = 'legacy payload 🔐 với unicode';
        const encrypted = await aes.encrypt({ message: plaintext, secret: SECRET_32 });
        expect(encrypted).not.toBe(plaintext);
        const result2 = await aes.decrypt({ message: encrypted, secret: SECRET_32 });
        expect(result2).toBe(plaintext);
      });
    }

    test('LTC-005: short + long secrets still roundtrip (padEnd / truncate)', async () => {
      const aes = LegacyAES.withAlgorithm('aes-256-gcm');
      const secrets = [SECRET_SHORT, SECRET_LONG];
      for (const secret of secrets) {
        const encrypted = await aes.encrypt({ message: 'x', secret });
        const result3 = await aes.decrypt({ message: encrypted, secret });
        expect(result3).toBe('x');
      }
    });

    test('LTC-006: ciphertext does NOT carry the new version byte header', async () => {
      // Old format starts with the raw IV, not the 0x01 version + key-id header.
      const aes = LegacyAES.withAlgorithm('aes-256-cbc');
      const enc = await aes.encrypt({
        message: 'no header here',
        secret: SECRET_32,
        opts: { iv: Buffer.alloc(16, 7) },
      });
      const raw = Buffer.from(enc, 'base64');
      expect(raw[0]).toBe(7); // first byte is the IV byte we forced, not a version tag
    });
  });

  describe('format isolation from the new AES (must NOT cross-decrypt)', () => {
    test('LTC-007: new AES cannot decrypt LegacyAES ciphertext', async () => {
      const legacy = LegacyAES.withAlgorithm('aes-256-gcm');
      const modern = AES.withAlgorithm('aes-256-gcm');
      const enc = await legacy.encrypt({ message: 'old data', secret: SECRET_32 });
      const result4 = await Rejection.messageOf({
        promise: modern.decrypt({ message: enc, secret: SECRET_32 }),
      });
      expect(result4).toBeString();
    });

    test('LTC-008: LegacyAES cannot decrypt new AES ciphertext', async () => {
      const legacy = LegacyAES.withAlgorithm('aes-256-gcm');
      const modern = AES.withAlgorithm('aes-256-gcm');
      const enc = await modern.encrypt({ message: 'new data', secret: SECRET_32 });
      const result5 = await Rejection.messageOf({
        promise: legacy.decrypt({ message: enc, secret: SECRET_32 }),
      });
      expect(result5).toBeString();
    });
  });
});
