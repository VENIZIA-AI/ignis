---
title: "A Real Hash Class Replaces the Removed hash() Utility"
description: "A new Hash class (digests and HMACs) replaces the removed hash() function, so every hash() call site must migrate, and AES gains an optional per-deployment key salt."
packages: ['@venizia/ignis-helpers']
---

# Changelog - 2026-08-30

## A Real Hash Class, and hash() Is Removed

<Badge type="tip" text="New Feature" /> <Badge type="danger" text="Security" /> <Badge type="danger" text="Breaking Change" />

**In one line.** `Hash` joins `AES`/`RSA`/`ECDH` in the crypto module. The old `hash()` free function is removed, not deprecated, and every caller must migrate to `Hash`.

## What changed

- **New `Hash` class** built like `AES`/`RSA` (`Hash.withAlgorithm(algorithm)`, options-object methods), with no `decrypt` since a digest cannot be reversed.
  - `digest({ message, opts? })` - a plain digest. Takes no secret.
  - `hmac({ message, secret, opts? })` - a keyed HMAC. A missing or empty `secret` throws instead of silently degrading to a plain digest.
- **Five algorithms, three output encodings:** `HashAlgorithms` (`MD5`, `SHA1`, `SHA256`, `SHA384`, `SHA512`) and `HashOutputEncodings` (`HEX`, `BASE64`, `BASE64URL`).
- **`hash()` is removed,** with no shim or alias. The old function returned `text` unhashed when a SHA256 `secret` was missing or the algorithm was unknown, with no error. That bug is gone with it.

```typescript
import { Hash, HashAlgorithms } from '@venizia/ignis-helpers';

// Plain digest - no secret possible, by design.
Hash.withAlgorithm(HashAlgorithms.SHA256).digest({ message: 'payload' });

// HMAC - secret required, validated non-empty.
Hash.withAlgorithm(HashAlgorithms.SHA256).hmac({ message: 'payload', secret: 'my-secret' });
```

## Who is affected

- **Every existing `hash()` caller.** Any code that imports it fails to compile. Migrate to `Hash` using the table below.
- **Digests are unchanged byte-for-byte,** so a migrated call site produces the same value, and a payment gateway checksum still verifies.
- **MD5 and SHA1 remain available** for wire-protocol compatibility (VNPay checksums and similar). They are unsuitable for security decisions. Prefer SHA256 or better for anything new.

## Breaking changes

> [!WARNING]
> `hash()` is removed, not deprecated. Migrate every call site to `Hash` before upgrading. Output is identical, only the call shape changes.

| Old call | New call |
|---|---|
| `hash(data, { algorithm: 'MD5', outputType: 'hex' })` | `Hash.withAlgorithm(HashAlgorithms.MD5).digest({ message: data, opts: { outputEncoding: HashOutputEncodings.HEX } })` |
| `hash(data, { algorithm: 'SHA256', secret, outputType: 'base64' })` | `Hash.withAlgorithm(HashAlgorithms.SHA256).hmac({ message: data, secret, opts: { outputEncoding: HashOutputEncodings.BASE64 } })` |
| `hash(data, { algorithm: 'SHA256', secret, outputType: 'hex' })` | `Hash.withAlgorithm(HashAlgorithms.SHA256).hmac({ message: data, secret, opts: { outputEncoding: HashOutputEncodings.HEX } })` |

`outputEncoding` defaults to `hex`, so `opts` can be dropped for hex:

```typescript
Hash.withAlgorithm(HashAlgorithms.MD5).digest({ message: data });
```

## AES Key Derivation Accepts a Per-Deployment Salt

<Badge type="tip" text="New Feature" /> <Badge type="danger" text="Security" />

**In one line.** `AES.encrypt`/`decrypt` accept optional `kdfSalt`/`kdfIterations`. Omit both and nothing changes.

Every IGNIS deployment derives AES keys with the same default salt, `DEFAULT_KDF_SALT`, so one precomputed table works against every deployment that uses a weak passphrase. The default cannot change, because existing ciphertext would become unreadable. This is an opt-in override.

- Supply the same values on both sides of a round trip. Omit both and the derivation is identical to before.
- A `kdfSalt` under 16 UTF-8 bytes throws.
- `LegacyAES`, `RSA` and `ECDH` do not accept these options.

| Option | Type | Default | Meaning |
|---|---|---|---|
| `kdfSalt` | `string` | `DEFAULT_KDF_SALT` | PBKDF2 salt. Minimum 16 UTF-8 bytes when supplied. |
| `kdfIterations` | `number` | `DEFAULT_KDF_ITERATIONS` (100,000) | PBKDF2 iteration count. |

```typescript
import { AES } from '@venizia/ignis-helpers';

const aes = AES.withAlgorithm('aes-256-gcm');

const isolated = aes.encrypt({
  message: 'payload',
  secret: 'my-secret',
  opts: { kdfSalt: 'this-deployment-only-salt-value' },
});

// The same salt is required to decrypt - a mismatched or missing one fails.
aes.decrypt({
  message: isolated,
  secret: 'my-secret',
  opts: { kdfSalt: 'this-deployment-only-salt-value' },
});
```

**Who is affected.** Existing callers need to do nothing. A deployment wanting isolation should pass a unique `kdfSalt` (16+ bytes) and keep it identical between encrypt and decrypt, since it is stored nowhere else.

## See also

- [AES Keys Derive with PBKDF2, and Ciphertext Carries a Key Id](./2026-08-06-aes-pbkdf2-and-key-rotation)
