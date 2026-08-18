---
title: AES Keys Derive with PBKDF2, and Ciphertext Carries a Key Id
description: AES key derivation moves from padding the secret to PBKDF2, the ciphertext gains a version and key-id header, and a keyring lets you rotate keys. Data written by an earlier IGNIS no longer decrypts with AES - read it with LegacyAES.
---

# Changelog - 2026-08-06

## AES Keys Derive with PBKDF2, and Ciphertext Carries a Key Id

<Badge type="danger" text="Breaking Change" /> <Badge type="tip" text="Security" /> <Badge type="tip" text="New Feature" />

**In one line.** Every AES ciphertext written by an earlier IGNIS stops decrypting with `AES`, and you either point those reads at `LegacyAES` or re-encrypt them.

## The problem it solves

AES-256 needs a 32-byte key. IGNIS built one by padding or truncating your secret:

```typescript
if (secret.length > length) return secret.slice(0, length);
return secret.padEnd(length, '0');
```

A secret of `'abc'` became the key `'abc00000000000000000000000000000'` - almost no entropy. A 60-character secret lost everything past character 32. And guessing the secret handed over the key for free: there was no work factor between the two.

Key derivation now runs PBKDF2-SHA256 for 100,000 iterations. Any secret, short or long, produces a full-entropy key, and each brute-force guess costs 100,000 hashes instead of one string operation.

## What changed

### Key derivation

`normalizeSecretKey` now returns a `Buffer` instead of a `string`, and the `padEnd` option is gone.

```typescript
// Before
normalizeSecretKey(opts: { secret: string; length: number; padEnd?: string }): string

// After
normalizeSecretKey(opts: { secret: string; length: number }): Buffer
```

Derived keys are memoised per secret, so the 100,000 iterations run once per process rather than per call.

### Ciphertext layout

The envelope became self-describing, because decryption has to know which key wrote it:

```
Before: [iv(16)][authTag(16, gcm only)][ciphertext]
After:  [version(1)][idLen(1)][id(idLen)][iv(16)][authTag(16, gcm only)][ciphertext]
```

### Key rotation

`secret` now accepts a keyring as well as a string. Encryption uses the first entry; decryption resolves the id in the envelope.

```typescript
const KEYRING = [
  { id: '2', secret: CURRENT_SECRET }, // everything new is written with this
  { id: '1', secret: RETIRED_SECRET }, // kept only so older rows still read
];

aes.encrypt({ message, secret: KEYRING });
aes.decrypt({ message: olderRow, secret: KEYRING });
```

Rotating a key means prepending an entry, not re-encrypting your data.

### `decrypt` no longer takes an `iv`

The envelope carries the IV, so a supplied one had nowhere to go. `IAESDecryptOptions` omits it and passing one is a compile error rather than a value silently discarded.

## Who is affected

| You | Impact |
|---|---|
| Store AES ciphertext (a column, a cache entry, a file via `encryptFile`) | Those reads fail until you switch them to `LegacyAES` or re-encrypt |
| Set `applicationSecret` on a bearer-token service | Every already-issued token fails verification as `TOKEN_INVALID` |
| Call `normalizeSecretKey` yourself | Signature changed - `Buffer`, and no `padEnd` |
| Use `AES` only for data written after upgrading | No action |
| Use `ECDH`, `RSA` or hashing | No action |

The token case is the loud one: at deploy, every active session ends at once, and the log shows the ordinary `Invalid or expired token` warning. It looks exactly like normal expiry.

## How to migrate

### Reading data written before the upgrade

`LegacyAES` reproduces the old derivation and the old layout exactly. Point the read at it - no re-encryption needed.

```typescript
import { LegacyAES } from '@venizia/ignis-helpers';

const legacy = LegacyAES.withAlgorithm('aes-256-cbc');
const plaintext = legacy.decrypt({ message: oldRow, secret: APPLICATION_SECRET });
```

The two formats never cross-decrypt. `AES` rejects a legacy envelope on the version byte, `LegacyAES` fails the auth tag on a new one, and neither falls back on its own.

### Keeping already-issued tokens valid

The bearer-token services take a `cipher`. Hand them `LegacyAES` and existing sessions keep working:

```typescript
new JWSTokenService({
  jwtSecret,
  getTokenExpiresFn,
  applicationSecret,
  cipher: LegacyAES.withAlgorithm('aes-256-cbc'),
});
```

`IJWSTokenServiceOptions`, `IJWKSIssuerOptions` and `IJWKSVerifierOptions` all accept it. Omit it and you get `AES`, so an application that has no old tokens needs no change.

Plan the switch back to `AES` yourself: issue new tokens under `AES` once the old ones have expired.

### Re-encrypting instead

Read with `LegacyAES`, write with `AES`, in one pass over the data. Give the new writes a keyring from the start so the next rotation costs nothing.

## Notes

- `DEFAULT_PAD_END` is still exported and is now `@deprecated`. `LegacyAES` uses it; nothing else does.
- A keyring entry with an empty `secret` is refused by name on both the encrypt and decrypt paths, instead of deriving a key from `''` and failing later inside OpenSSL.
- The PBKDF2 salt is a fixed constant. That is deliberate: the key must be derivable from the secret alone, with no salt stored beside the ciphertext. The iteration count, not the salt, is what makes guessing expensive.

**Files:**

- [`packages/helpers/src/modules/crypto/algorithms/aes.algorithm.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/crypto/algorithms/aes.algorithm.ts)
- [`packages/helpers/src/modules/crypto/algorithms/aes-legacy.algorithm.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/crypto/algorithms/aes-legacy.algorithm.ts)
- [`packages/helpers/src/modules/crypto/algorithms/base.algorithm.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/crypto/algorithms/base.algorithm.ts)
- [`packages/core-server/src/components/auth/authenticate/services/bearer/abstract.service.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/components/auth/authenticate/services/bearer/abstract.service.ts)
