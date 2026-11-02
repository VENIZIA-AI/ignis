---
title: "AES, LegacyAES and RSA are async, and run over Web Crypto"
description: "AES, LegacyAES and RSA methods now return promises because they run on the Web Crypto API instead of node:crypto."
packages: ['@venizia/ignis-helpers', '@venizia/ignis']
---

# Changelog - 2026-11-02

## AES, LegacyAES and RSA are async, and run over Web Crypto

<Badge type="warning" text="Breaking Change" />

**In one line.** Add `await` to all `AES`, `LegacyAES`, and `RSA` calls because their methods now return a Promise.

## What changed

`AES`, `LegacyAES`, and `RSA` from `@venizia/ignis-helpers` no longer import `node:crypto`. They run over the Web Crypto API (`crypto.subtle`).

Their methods now return a Promise: `encrypt`, `decrypt`, `encryptFile`, `decryptFile`, `RSA.generateDERKeyPair`, and `normalizeSecretKey` (now `Promise<Buffer>`).

In `@venizia/ignis`, bearer token services await the cipher. `encryptPayload` and `decryptPayload` on the abstract bearer token service now return `Promise<Record<string, any>>` and `Promise<IJWTTokenPayload>`. `generate` and `verify` were already async and need no change.

`IPayloadCipher` methods `encrypt` and `decrypt` now return `string | Promise<string>`. A custom cipher that answers with a plain string still works.

Validation is stricter now. An AES key that is not exactly 32 bytes is refused. An IV that is not 16 bytes is refused. A GCM auth tag that is not 16 bytes is refused before decrypting.

Errors still throw by default, and `opts.doThrow: false` still hands the original message back. With the async API, the throw is a rejected promise.

## Who is affected

You are affected if you call `encrypt`, `decrypt`, `encryptFile`, `decryptFile`, or `RSA.generateDERKeyPair` from `@venizia/ignis-helpers`.

You are affected if you subclass `BaseCryptoAlgorithm` and call `normalizeSecretKey`.

You are affected if you override `encryptPayload` or `decryptPayload` on the abstract bearer token service in `@venizia/ignis`.

## Breaking changes

> [!WARNING]
> Cryptographic operations in `@venizia/ignis-helpers` are now asynchronous. You must await their return values.

**Before:**

```typescript
const encrypted = aes.encrypt({ message, secret });
const { publicKey, privateKey } = rsa.generateDERKeyPair();
```

**After:**

```typescript
const encrypted = await aes.encrypt({ message, secret });
const { publicKey, privateKey } = await rsa.generateDERKeyPair();
```

To upgrade:

1. Add `await` at every call to `AES`, `LegacyAES`, and `RSA` methods.
2. Mark enclosing functions as `async`.
3. Add `await` inside any `try`/`catch` block around these calls so errors are caught.
4. Run your typecheck to find results used as a string.
5. Search manually for results placed in template strings, logged values, or values passed to `any` or `unknown`.
6. Enable `@typescript-eslint/no-floating-promises` to catch unawaited calls.
7. Search JavaScript files manually for missing `await` keywords.
8. Update subclasses of `BaseCryptoAlgorithm` calling `normalizeSecretKey` to await the returned `Promise<Buffer>`.
9. Update overrides of `encryptPayload` and `decryptPayload` to return promises.

## Details

There is no codemod because a codemod cannot add `await` safely.

Data you already stored still reads. The new code writes the same bytes as the old code for the same input. This was checked with recorded fixtures for the versioned AES envelope (aes-256-cbc and aes-256-gcm), the legacy envelope, PBKDF2 key bytes, RSA keys, and ciphertext.

The envelope format, aes-256-cbc padding, GCM tag position, PBKDF2 settings (SHA-256, 100000 iterations, default salt), and RSA settings (OAEP with SHA-1, public exponent 65537, DER spki and pkcs8 keys) are unchanged.

The derived-key cache stays. A key is derived once per secret. Calls that start at the same moment share one derivation. A failed derivation is not cached.

`AES` and `RSA` are still not exported from `@venizia/ignis-helpers/core` because they need a server runtime.
