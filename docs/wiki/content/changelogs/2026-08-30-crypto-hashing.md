---
title: "A Real Hash Class Replaces the Removed hash() Utility"
description: "Added a Hash class (digests and HMACs, five algorithms, three output encodings) to the crypto module, and removed the old hash() utility outright. Every hash() call site must migrate - see the migration table."
---

# Changelog - 2026-08-30

## A Real Hash Class, and hash() Is Removed

<Badge type="tip" text="New Feature" /> <Badge type="danger" text="Security" /> <Badge type="danger" text="Breaking Change" />

**In one line.** `Hash` joins `AES`/`RSA`/`ECDH` in the crypto module. The old `hash()` free function is gone - not deprecated, removed - and every caller must migrate to `Hash`.

## The problem it solves

`utilities/crypto.utility.ts` exported one function, `hash(text, options)`, with two branches that returned `text` completely unhashed:

```typescript
case 'SHA256': {
  if (!secret) {
    return text; // plaintext, unhashed, no error
  }
  // ...
}
default: {
  return text; // plaintext, unhashed, no error
}
```

A caller that forgot `secret` stored or compared plaintext with no error and no log line. There was also no real `Hash` class - every algorithm in `modules/crypto` (`AES`, `RSA`, `ECDH`) had one except the one function most payment integrations actually call.

## What changed

- **New `Hash` class** in `packages/helpers/src/modules/crypto/algorithms/hash.algorithm.ts`, built like `AES`/`RSA` (`Hash.withAlgorithm(algorithm)`, options-object methods) but with no `decrypt` - a digest cannot be reversed, so it is not an `ICryptoAlgorithm`.
  - `digest({ message, opts? })` - a plain digest. Takes no secret at all.
  - `hmac({ message, secret, opts? })` - a keyed HMAC. `secret` is required and validated non-empty; a missing or empty secret throws instead of ever silently degrading to a plain digest.
- **Five algorithms, three output encodings**, both as const-classes: `HashAlgorithms` (`MD5`, `SHA1`, `SHA256`, `SHA384`, `SHA512`) and `HashOutputEncodings` (`HEX`, `BASE64`, `BASE64URL`).
- **`hash()` is removed.** `utilities/crypto.utility.ts` no longer exists. There is no shim, no deprecation warning, no delegating wrapper - the function is gone, and so is the plaintext-passthrough bug it used to fall back to.

```typescript
import { Hash, HashAlgorithms } from '@venizia/ignis-helpers';

// Plain digest - no secret possible, by design.
Hash.withAlgorithm(HashAlgorithms.SHA256).digest({ message: 'payload' });

// HMAC - secret required, validated non-empty.
Hash.withAlgorithm(HashAlgorithms.SHA256).hmac({ message: 'payload', secret: 'my-secret' });
```

## Who is affected

- **Every existing `hash()` caller.** This is a breaking change, not a deprecation. `hash()` no longer exists, so any code that imports it fails to compile. Migrate to `Hash` - see the table below.
- **Digests are unchanged byte-for-byte.** `Hash` computes the same bytes `hash()` always did, so a migrated call site produces the same value it produced before - a payment gateway checksum still verifies.
- **MD5 and SHA1 remain available** for wire-protocol compatibility (VNPay checksums and similar). Both are documented in `Hash` as unsuitable for security decisions; prefer SHA256 or better for anything new.

## Breaking changes

> [!WARNING]
> `hash()` is removed, not deprecated. Every call site must migrate to `Hash` before upgrading - there is no fallback and no alias.

Three call shapes cover every known caller. Output is identical in all three - only the call shape changes.

| Old call | New call |
|---|---|
| `hash(data, { algorithm: 'MD5', outputType: 'hex' })` (13 sites) | `Hash.withAlgorithm(HashAlgorithms.MD5).digest({ message: data, opts: { outputEncoding: HashOutputEncodings.HEX } })` |
| `hash(data, { algorithm: 'SHA256', secret, outputType: 'base64' })` (2 sites) | `Hash.withAlgorithm(HashAlgorithms.SHA256).hmac({ message: data, secret, opts: { outputEncoding: HashOutputEncodings.BASE64 } })` |
| `hash(data, { algorithm: 'SHA256', secret, outputType: 'hex' })` | `Hash.withAlgorithm(HashAlgorithms.SHA256).hmac({ message: data, secret, opts: { outputEncoding: HashOutputEncodings.HEX } })` |

`outputEncoding` defaults to `hex`, so `opts` can be dropped entirely when the target encoding is `hex`:

```typescript
// Equivalent to the MD5/hex row above.
Hash.withAlgorithm(HashAlgorithms.MD5).digest({ message: data });
```

## Details

- `Hash.withAlgorithm` is memoized - at most five instances ever exist, one per algorithm.
- `HashAlgorithms`/`HashOutputEncodings` follow the repo's const-class convention (`TConstValue`-typed static members), not string-literal unions.
- Every failure path uses `getError`/`ApplicationError` - never a raw `Error`.
- Also replaced the deprecated `crypto.Encoding` type with `BufferEncoding` in `AES`, `LegacyAES`, and `RSA` - a type-only cleanup, not a behavior change.

| File | Package |
|------|---------|
| `src/modules/crypto/algorithms/hash.algorithm.ts` | helpers |
| `src/modules/crypto/common/constants.ts` | helpers |
| `src/modules/crypto/algorithms/aes.algorithm.ts` | helpers |
| `src/modules/crypto/algorithms/aes-legacy.algorithm.ts` | helpers |
| `src/modules/crypto/algorithms/rsa.algorithm.ts` | helpers |

## AES Key Derivation Accepts a Per-Deployment Salt

<Badge type="tip" text="New Feature" /> <Badge type="danger" text="Security" />

**In one line.** `AES.encrypt`/`decrypt` accept optional `kdfSalt`/`kdfIterations`. Omit both and nothing changes.

### The problem it solves

Every IGNIS deployment derives AES keys with the same hardcoded salt, `DEFAULT_KDF_SALT`. A salt's job is to stop a precomputed table from working against more than one target - a constant salt shipped inside a published package defeats that: one precomputed table now works against every deployment that derives a key from a weak passphrase.

The default cannot simply change. A downstream product already has data encrypted with keys derived from it, and a new default would make that ciphertext permanently unreadable. So this ships as an opt-in override, not a new default.

### What changed

- `AES.encrypt`/`decrypt` accept `opts.kdfSalt` and `opts.kdfIterations`. Supply the same values on both sides of a round trip.
- Omit both and the derivation is byte-for-byte identical to before - pinned in a test against `node:crypto` directly, independent of the module's own constants.
- A `kdfSalt` under 16 UTF-8 bytes throws instead of being silently accepted - short enough to look configured while giving up most of what a salt is for.
- `LegacyAES` does not accept either option: its key derivation predates PBKDF2 and has no salt to override.

| Option | Type | Default | Meaning |
|---|---|---|---|
| `kdfSalt` | `string` | `DEFAULT_KDF_SALT` | PBKDF2 salt. Minimum 16 UTF-8 bytes when supplied. |
| `kdfIterations` | `number` | `DEFAULT_KDF_ITERATIONS` (100,000) | PBKDF2 iteration count. |

```typescript
import { AES } from '@venizia/ignis-helpers';

const aes = AES.withAlgorithm('aes-256-gcm');

// Unchanged: no kdfSalt, no kdfIterations - identical to every prior release.
const encrypted = aes.encrypt({ message: 'payload', secret: 'my-secret' });

// Per-deployment isolation: pass a salt unique to this deployment.
const isolated = aes.encrypt({
  message: 'payload',
  secret: 'my-secret',
  opts: { kdfSalt: 'this-deployment-only-salt-value' },
});

// The same salt is required to decrypt - a mismatched or missing one fails to decrypt.
aes.decrypt({
  message: isolated,
  secret: 'my-secret',
  opts: { kdfSalt: 'this-deployment-only-salt-value' },
});
```

### Who is affected

- **Every existing caller.** Nothing to do - output is byte-for-byte identical with no `kdfSalt`/`kdfIterations` supplied.
- **Deployments wanting isolation from the shipped default.** Pass a `kdfSalt` unique to the deployment (16+ bytes), and keep it identical between encrypt and decrypt - there is nowhere else the value is stored.

### Details

- Validation uses `getError`/`ApplicationError`, never a raw `Error`.
- The 16-byte minimum follows NIST SP 800-132's 128-bit recommendation for a KDF salt.
- `RSA` and `ECDH` do not derive keys from a passphrase via PBKDF2, so neither takes this option.

| File | Package |
|------|---------|
| `src/modules/crypto/common/constants.ts` | helpers |
| `src/modules/crypto/algorithms/base.algorithm.ts` | helpers |
| `src/modules/crypto/algorithms/aes.algorithm.ts` | helpers |
| `src/modules/crypto/algorithms/aes-legacy.algorithm.ts` | helpers |

## See also

- [AES Keys Derive with PBKDF2, and Ciphertext Carries a Key Id](./2026-08-06-aes-pbkdf2-and-key-rotation) - the previous crypto module change
