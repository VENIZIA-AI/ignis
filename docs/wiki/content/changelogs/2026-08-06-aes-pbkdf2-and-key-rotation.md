---
title: AES Keys Derive with PBKDF2, and Ciphertext Carries a Key Id
description: AES keys now derive with PBKDF2 and ciphertext carries a key id for rotation, so data written by an earlier IGNIS must be read with LegacyAES or re-encrypted.
packages: ['@venizia/ignis-helpers']
---

# Changelog - 2026-08-06

## AES Keys Derive with PBKDF2, and Ciphertext Carries a Key Id

<Badge type="danger" text="Breaking Change" /> <Badge type="tip" text="Security" /> <Badge type="tip" text="New Feature" />

**In one line.** Every AES ciphertext written by an earlier IGNIS stops decrypting with `AES`, and you either point those reads at `LegacyAES` or re-encrypt them.

## What changed

- **Stronger key derivation.** IGNIS used to build the AES-256 key by padding or truncating your secret, so `'abc'` became `'abc00000000000000000000000000000'`. It now runs PBKDF2-SHA256 for 100,000 iterations, so any secret produces a full-entropy key and each guess costs 100,000 hashes. Derived keys are memoised per secret.
- **Self-describing ciphertext.** The layout is now `[version(1)][idLen(1)][id(idLen)][iv(16)][authTag(16, gcm only)][ciphertext]`.
- **Key rotation.** `secret` accepts a keyring as well as a string. Encryption uses the first entry; decryption resolves the id in the envelope. Rotating means prepending an entry, not re-encrypting your data.
- **`decrypt` no longer takes an `iv`.** `IAESDecryptOptions` omits it, so passing one is a compile error.
- **`normalizeSecretKey`** now returns a `Buffer`, and the `padEnd` option is gone.

```typescript
const KEYRING = [
  { id: '2', secret: CURRENT_SECRET }, // everything new is written with this
  { id: '1', secret: RETIRED_SECRET }, // kept only so older rows still read
];

aes.encrypt({ message, secret: KEYRING });
aes.decrypt({ message: olderRow, secret: KEYRING });
```

## Who is affected

| You | Impact |
|---|---|
| Store AES ciphertext (a column, a cache entry, a file via `encryptFile`) | Those reads fail until you switch them to `LegacyAES` or re-encrypt |
| Set `applicationSecret` on a bearer-token service | Every already-issued token fails verification as `TOKEN_INVALID` |
| Call `normalizeSecretKey` yourself | Signature changed - `Buffer`, and no `padEnd` |
| Use `AES` only for data written after upgrading | No action |
| Use `ECDH`, `RSA` or hashing | No action |

The token case is the loud one: at deploy, every active session ends at once, and the log shows the ordinary `Invalid or expired token` warning, which looks exactly like normal expiry.

## Breaking changes

> [!WARNING]
> Data written by an earlier IGNIS no longer decrypts with `AES`.

**Before:**

```typescript
normalizeSecretKey(opts: { secret: string; length: number; padEnd?: string }): string
```

**After:**

```typescript
normalizeSecretKey(opts: { secret: string; length: number }): Buffer
```

### Read data written before the upgrade

`LegacyAES` reproduces the old derivation and layout exactly. Point the read at it - no re-encryption needed.

```typescript
import { LegacyAES } from '@venizia/ignis-helpers';

const legacy = LegacyAES.withAlgorithm('aes-256-cbc');
const plaintext = legacy.decrypt({ message: oldRow, secret: APPLICATION_SECRET });
```

The two formats never cross-decrypt, and neither falls back on its own.

### Keep already-issued tokens valid

The bearer-token services take a `cipher`. Hand them `LegacyAES` and existing sessions keep working:

```typescript
new JWSTokenService({
  jwtSecret,
  getTokenExpiresFn,
  applicationSecret,
  cipher: LegacyAES.withAlgorithm('aes-256-cbc'),
});
```

`IJWSTokenServiceOptions`, `IJWKSIssuerOptions` and `IJWKSVerifierOptions` all accept it. Omit it and you get `AES`, so an app with no old tokens needs no change. Plan the switch back to `AES` yourself: issue new tokens under `AES` once the old ones have expired.

### Re-encrypt instead

Read with `LegacyAES`, write with `AES`, in one pass over the data. Give the new writes a keyring from the start so the next rotation costs nothing.

## Details

- `DEFAULT_PAD_END` is still exported and is now `@deprecated`.
- A keyring entry with an empty `secret` is refused by name on both encrypt and decrypt.
- The PBKDF2 salt is a fixed constant, so the key can be derived from the secret alone with no salt stored beside the ciphertext. The iteration count is what makes guessing expensive.
