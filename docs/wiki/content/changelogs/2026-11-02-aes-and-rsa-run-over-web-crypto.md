---
title: AES, LegacyAES and RSA are async, and run over Web Crypto
description: AES, LegacyAES and RSA methods now run over Web Crypto and return promises.
packages: ['@venizia/ignis-helpers', '@venizia/ignis']
---

# Changelog - 2026-11-02

## AES, LegacyAES and RSA are async, and run over Web Crypto

<Badge type="warning" text="Breaking Change" />

**In one line.** Add `await` to your `AES`, `LegacyAES` and `RSA` calls because their methods now return promises.

## What changed

`AES`, `LegacyAES` and `RSA` from `@venizia/ignis-helpers` no longer import `node:crypto`.
They run over the Web Crypto API (`crypto.subtle`).
Their methods return a Promise.
This change affects `encrypt`, `decrypt`, `encryptFile`, `decryptFile`, `RSA.generateDERKeyPair`, and `normalizeSecretKey`.
`normalizeSecretKey` on the base class now returns `Promise<Buffer>`.

Stored data still reads without changes.
The new code writes the same bytes as the old code for the same input.
This was checked with recorded fixtures for the versioned AES envelope (aes-256-cbc and aes-256-gcm), legacy envelope, PBKDF2 key bytes, RSA keys, and ciphertext.
The envelope format is unchanged.
The aes-256-cbc padding is unchanged.
The position of the GCM tag is unchanged.
The PBKDF2 settings remain SHA-256, 100000 iterations, and the default salt.
The RSA settings remain OAEP with SHA-1, public exponent 65537, and DER spki and pkcs8 keys.

The derived-key cache stays.
A key is derived once per secret.
Calls that start at the same moment share one derivation.
A failed derivation is not cached.

Input validation is stricter now.
An AES key that is not exactly 32 bytes is refused.
An IV that is not 16 bytes is refused.
A GCM auth tag that is not 16 bytes is refused before decrypting.

In `@venizia/ignis`, bearer token services (JWS and JWKS) await the cipher.
`encryptPayload` on the abstract bearer token service now returns `Promise<Record<string, any>>`.
`decryptPayload` on the abstract bearer token service now returns `Promise<IJWTTokenPayload>`.
`generate` and `verify` were already async and need no change.

`IPayloadCipher` now allows `encrypt` and `decrypt` to return `string | Promise<string>`.
A custom cipher that answers with a plain string still works.

`AES` and `RSA` are still not exported from `@venizia/ignis-helpers/core` because they need a server runtime.

## Who is affected

You are affected if you call `AES`, `LegacyAES`, or `RSA` from `@venizia/ignis-helpers`.
You are affected if you call or override `encryptPayload` or `decryptPayload` in `@venizia/ignis`.
You are affected if you subclass `BaseCryptoAlgorithm` and call `normalizeSecretKey`.
You are affected if your tests check the exact error message of a failed decryption.

## Breaking changes

> [!WARNING]
> You must add `await` to crypto method calls and update calling functions to `async`.

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

1. Add `await` at every call to `encrypt`, `decrypt`, `encryptFile`, `decryptFile`, and `RSA.generateDERKeyPair`.
2. Make the enclosing functions `async`.
3. Run your typecheck to locate results used as strings, such as assignments, arguments, `.length`, `===` checks, or `if` conditions.
4. Search your code for results placed in template strings or console logs, which would print `[object Promise]`.
5. Search your code for results passed into parameters typed `any` or `unknown`.
6. Check your JavaScript files manually.
7. Turn on the `@typescript-eslint/no-floating-promises` rule to find calls that nobody awaits.
8. Update `try`/`catch` blocks so that calls inside the `try` block use `await`.
9. Update any subclass of `BaseCryptoAlgorithm` that calls `normalizeSecretKey` to await the returned `Promise<Buffer>`.
10. Update any overrides of `encryptPayload` or `decryptPayload` to return promises.
11. Update tests or error-handling code that matches the old decryption error text.

## Details

There is no codemod because a codemod cannot add `await` safely.

Errors still throw by default.
Passing `opts.doThrow: false` still returns the original message back.
With the async API, a thrown error is a rejected promise.
You must use `await` inside the `try` block to catch the rejection.

The error you catch has changed.
A failed decryption previously threw the Node error `Unsupported state or unable to authenticate data` (aes-256-gcm) or a padding error (aes-256-cbc).
It now rejects with `OperationError: The operation failed for an operation-specific reason` for both modes.
This behavior was checked in Bun 1.4.4.
Code or tests that match the old message text must change.
Code that only catches the error is not affected.
