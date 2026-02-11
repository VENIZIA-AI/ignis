---
title: Crypto Algorithm Refactor & ECDH
description: Unified type hierarchy for crypto algorithms, options-object API, ECDH P-256 key exchange, and 79 test cases
---

# Changelog - 2026-02-11

## Crypto Algorithm Refactor & ECDH Key Exchange

The crypto module previously had inconsistent API patterns (positional args vs options objects), a standalone `ECDH` class that didn't integrate with the type hierarchy, and zero test coverage. This release unifies all crypto algorithms under a 7-param generic type hierarchy, standardizes the options-object API across AES/RSA/ECDH, and adds comprehensive test coverage with 79 test cases.

## Overview

- **Unified Type Hierarchy**: `ICryptoAlgorithm` expanded from 6 to 7 generic type parameters — split `MessageType` into `EncryptInputType` + `DecryptInputType` to support ECDH's asymmetric input/output types
- **Options-Object API**: All `encrypt()`/`decrypt()` methods now use `{ message, secret, opts? }` pattern — consistent with Ignis conventions
- **ECDH Integration**: `ECDH` class now extends `AbstractCryptoAlgorithm` (inherits `BaseHelper` scoped logging) instead of being standalone
- **Full Test Suite**: 79 tests / 110 assertions covering AES (CBC + GCM), RSA, ECDH, file operations, error handling, and cross-algorithm isolation

## Breaking Changes

> [!WARNING]
> This section contains changes that require migration or manual updates to existing code.

### 1. `encrypt()` / `decrypt()` API Changed to Options Objects

**Before:**
```typescript
aes.encrypt(message, secret);
aes.decrypt(encrypted, secret);
rsa.encrypt(message, publicKey);
rsa.decrypt(encrypted, privateKey);
```

**After:**
```typescript
aes.encrypt({ message, secret });
aes.decrypt({ message: encrypted, secret });
rsa.encrypt({ message, secret: publicKey });
rsa.decrypt({ message: encrypted, secret: privateKey });
```

### 2. Extra Options Moved to `opts` Property

**Before:**
```typescript
aes.encrypt(message, secret, { iv, inputEncoding, outputEncoding });
```

**After:**
```typescript
aes.encrypt({ message, secret, opts: { iv, inputEncoding, outputEncoding } });
```

### 3. `ICryptoAlgorithm` Generic Parameters Changed

**Before (6 params):**
```typescript
ICryptoAlgorithm<AlgorithmNameType, MessageType, SecretKeyType, EncryptReturnType, DecryptReturnType, ExtraOptions>
```

**After (7 params):**
```typescript
ICryptoAlgorithm<AlgorithmNameType, EncryptInputType, DecryptInputType, SecretKeyType, EncryptReturnType, DecryptReturnType, ExtraOptions>
```

## New Features

### 1. ECDH P-256 Key Exchange Integration

**File:** `packages/helpers/src/helpers/crypto/algorithms/ecdh.algorithm.ts`

**Problem:** The `ECDH` class was standalone — it didn't extend `AbstractCryptoAlgorithm`, had no scoped logging, and wasn't part of the type hierarchy.

**Solution:** `ECDH` now extends `AbstractCryptoAlgorithm<ECDHAlgorithmType, string, IECDHEncryptedPayload, CryptoKey, Promise<IECDHEncryptedPayload>, Promise<string>>` — fully integrated with the crypto type system.

```typescript
const ecdh = ECDH.withAlgorithm();

// Complete key exchange
const alice = await ecdh.generateKeyPair();
const bob = await ecdh.generateKeyPair();

const bobPub = await ecdh.importPublicKey({ rawKeyB64: bob.publicKeyB64 });
const aliceKey = await ecdh.deriveAESKey({
  privateKey: alice.keyPair.privateKey,
  peerPublicKey: bobPub,
});

const encrypted = await ecdh.encrypt({ message: 'Hello!', secret: aliceKey });
```

**Benefits:**
- Inherits `BaseHelper` scoped logging via `AbstractCryptoAlgorithm`
- Proper `algorithm` field (`'ecdh-p256'`) on instance
- Exported from `@venizia/ignis-helpers` alongside AES and RSA
- Uses Web Crypto API — works in Bun and browsers

### 2. Unified 7-Parameter Type Hierarchy

**File:** `packages/helpers/src/helpers/crypto/common/types.ts`

**Problem:** The original `ICryptoAlgorithm` used a single `MessageType` for both encrypt input and decrypt input. ECDH encrypts strings but decrypts `IECDHEncryptedPayload` objects — these are different types.

**Solution:** Split into `EncryptInputType` and `DecryptInputType`:

```typescript
export interface ICryptoAlgorithm<
  AlgorithmNameType extends string,
  EncryptInputType = unknown,   // What goes INTO encrypt()
  DecryptInputType = unknown,   // What goes INTO decrypt()
  SecretKeyType = unknown,
  EncryptReturnType = unknown,
  DecryptReturnType = unknown,
  ExtraOptions = unknown,
> {
  algorithm: AlgorithmNameType;
  encrypt(opts: { message: EncryptInputType; secret: SecretKeyType; opts?: ExtraOptions }): EncryptReturnType;
  decrypt(opts: { message: DecryptInputType; secret: SecretKeyType; opts?: ExtraOptions }): DecryptReturnType;
}
```

### 3. Comprehensive Test Suite

**File:** `packages/helpers/src/__tests__/crypto/algorithms.test.ts`

79 tests covering all crypto algorithms:

| Category | Tests | Coverage |
|----------|-------|---------|
| BaseCryptoAlgorithm | TC-001 — TC-010 | Construction, validation, `normalizeSecretKey`, `getAlgorithmKeySize` |
| AES-256-CBC | TC-011 — TC-025 | Roundtrip, secrets, IV, encoding, error handling, unicode, JSON |
| AES-256-GCM | TC-026 — TC-036 | Same as CBC + auth tag tamper detection |
| AES Cross-algorithm | TC-037 — TC-038 | CBC ↔ GCM isolation |
| AES File Ops | TC-039 — TC-042 | `encryptFile`/`decryptFile`, empty path guard |
| RSA | TC-043 — TC-057 | Key generation, roundtrip, encoding, error handling |
| ECDH | TC-058 — TC-079 | Key exchange, derivation, roundtrip, hkdfInfo isolation, third-party rejection |

## Files Changed

### Helpers Package (`packages/helpers`)

| File | Changes |
|------|---------|
| `src/helpers/crypto/common/types.ts` | `ICryptoAlgorithm` expanded from 6 to 7 generic params (split `MessageType` → `EncryptInputType` + `DecryptInputType`) |
| `src/helpers/crypto/algorithms/base.algorithm.ts` | `AbstractCryptoAlgorithm` and `BaseCryptoAlgorithm` updated to 7 generic params; options-object signatures on abstract methods |
| `src/helpers/crypto/algorithms/aes.algorithm.ts` | `encrypt()`/`decrypt()` now use `{ message, secret, opts? }` pattern; `encryptFile()`/`decryptFile()` use `{ absolutePath, secret }` |
| `src/helpers/crypto/algorithms/rsa.algorithm.ts` | Same options-object refactor; explicit 7-param extends |
| `src/helpers/crypto/algorithms/ecdh.algorithm.ts` | Now extends `AbstractCryptoAlgorithm`; options-object API; HKDF info default changed to `'ignis-ecdh-aes-gcm'` |
| `src/helpers/crypto/algorithms/index.ts` | Added ECDH export |
| `src/__tests__/crypto/algorithms.test.ts` | New — 79 tests, 110 assertions |

### Core Package (`packages/core`)

| File | Changes |
|------|---------|
| `src/components/auth/authenticate/services/jwt-token.service.ts` | Updated AES consumer to use options objects: `this.aes.encrypt({ message, secret })` |

### Documentation (`packages/docs`)

| File | Changes |
|------|---------|
| `wiki/references/helpers/crypto.md` | Rewritten — added ECDH section, type hierarchy diagram, updated AES/RSA examples to options-object API |
| `wiki/changelogs/2026-02-11-crypto-refactor-ecdh.md` | New — this changelog |
| `wiki/changelogs/index.md` | Added entry for this changelog |
| `site/.vitepress/config.mts` | Added sidebar entry for this changelog |

## Migration Guide

> [!NOTE]
> Follow these steps if you're upgrading from a previous version.

### Step 1: Update `encrypt()` / `decrypt()` Calls

Find all calls to AES/RSA `encrypt` and `decrypt` and convert from positional to options-object:

```typescript
// Before
aes.encrypt(message, secret);
aes.decrypt(encrypted, secret);

// After
aes.encrypt({ message, secret });
aes.decrypt({ message: encrypted, secret });
```

### Step 2: Update Extra Options

If you passed extra options as a third argument, move them to the `opts` property:

```typescript
// Before
aes.encrypt(message, secret, { iv: myIv, doThrow: false });

// After
aes.encrypt({ message, secret, opts: { iv: myIv, doThrow: false } });
```

### Step 3: Update Custom Subclasses (if any)

If you extended `BaseCryptoAlgorithm`, update the generic parameters:

```typescript
// Before (6 params)
class MyAlgo extends BaseCryptoAlgorithm<MyType, string, string, string, string, IMyOptions> {}

// After (7 params)
class MyAlgo extends BaseCryptoAlgorithm<MyType, string, string, string, string, string, IMyOptions> {}
```

## Verification Results

| Check | Result |
|-------|--------|
| `packages/helpers` rebuild | Clean |
| `packages/helpers` lint | Clean (0 errors, 0 warnings) |
| `packages/helpers` tests | 79 pass, 0 fail, 110 expect() calls |
| `packages/core` rebuild | Clean |
