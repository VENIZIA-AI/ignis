---
title: "AES, LegacyAES and RSA are async, and run over Web Crypto"
description: "AES, LegacyAES and RSA methods now run over Web Crypto and return promises."
packages: ['@venizia/ignis-helpers', '@venizia/ignis']
---

# Changelog - 2026-11-02

## AES, LegacyAES and RSA are async, and run over Web Crypto

<Badge type="warning" text="Breaking Change" />

**In one line.** Add `await` to calls to `AES`, `LegacyAES`, and `RSA` methods because they now run over the Web Crypto API and return promises.

## What changed

`AES`, `LegacyAES`, and `RSA` from `@venizia/ignis-helpers` no longer import `node:crypto`.
They run over the Web Crypto API (`crypto.subtle`).
Their methods return a Promise: `encrypt`, `decrypt`, `encryptFile`, `decryptFile`, `RSA.generateDERKeyPair`, and `normalizeSecretKey`.
The `normalizeSecretKey` method on the base class now returns `Promise<Buffer>`.
In `@venizia/ignis`, the bearer token services (JWS and JWKS) await the cipher.
The methods `encryptPayload` and `decryptPayload` on the abstract bearer token service now return `Promise<Record<string, any>>` and `Promise<IJWTTokenPayload>`.
The `IPayloadCipher` interface methods `encrypt` and `decrypt` now return `string | Promise<string>`.
A custom cipher that answers with a plain string still works.
`generate` and `verify` were already async and need no change.
`AES` and `RSA` are still not exported from `@venizia/ignis-helpers/core`.

Data you already stored still reads.
The new code writes the same bytes as the old code for the same input.
The envelope format, the aes-256-cbc padding, the position of the GCM tag, the PBKDF2 settings, and the RSA settings are unchanged.
The PBKDF2 settings remain SHA-256, 100000 iterations, and default salt.
The RSA settings remain OAEP with SHA-1, public exponent 65537, and DER spki and pkcs8 keys.
The derived-key cache stays.
A key is derived once per secret.
Calls that start at the same moment share one derivation.
A failed derivation is not cached.

Input validation is stricter now.
An AES key that is not exactly 32 bytes is refused.
`AES.encrypt` refuses an `iv` option that is not 16 bytes.
A CBC IV must be 16 bytes.
`LegacyAES` with aes-256-gcm still accepts any IV length of 1 byte or more.
A GCM auth tag that is not 16 bytes is refused before decrypting.
The `kdfIterations` setting must be an integer from 1 to 2147483647.

Errors still throw by default.
Passing `opts.doThrow: false` still hands the original message back.
The error message on failed decryption changed.
A failed decryption now rejects with `OperationError: The operation failed for an operation-specific reason` for both aes-256-gcm and aes-256-cbc.

## Who is affected

You are affected if you call methods on `AES`, `LegacyAES`, or `RSA`.
You are affected if you call or override `encryptPayload` or `decryptPayload` on the abstract bearer token service.
You are affected if you subclass `BaseCryptoAlgorithm` and call `normalizeSecretKey`.
You are affected if your code or tests match the exact error message of a failed decryption.

## Breaking changes

> [!WARNING]
> Calls to `AES`, `LegacyAES`, and `RSA` methods now return a Promise instead of a synchronous value. You must await them.

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
2. Mark the functions that contain those calls as `async`.
3. Use `await` inside `try` blocks when catching decryption errors.
4. Update any error message checks in code or tests from the old Node errors to `OperationError: The operation failed for an operation-specific reason`.
5. Update overrides of `encryptPayload` and `decryptPayload` to return promises.
6. Await calls to `normalizeSecretKey` in subclasses of `BaseCryptoAlgorithm`.
7. Run your typecheck to catch results used directly as strings.
8. Search manually for calls used inside template strings, logged values, `any`/`unknown` assignments, JavaScript files, and unawaited floating promises.

## Details

There is no codemod because a codemod cannot add `await` safely.
Run your typecheck first.
The typecheck finds a result used as a string.
This includes values assigned to a `string`, passed where a `string` is expected, checked with `.length`, compared with `===`, or used in an `if`.

The typecheck does not find every unawaited call.
Search your codebase manually for unawaited promises.
Check results put in template strings or logged, because an unawaited promise prints `[object Promise]`.
Check calls whose result goes into a parameter typed `any` or `unknown`.
Check plain JavaScript files.
Turn on the `@typescript-eslint/no-floating-promises` rule to catch unawaited calls.
Check `try`/`catch` blocks around a call that is not awaited inside the `try`, because errors will bypass the catch block.
Check subclasses of `BaseCryptoAlgorithm` that call `normalizeSecretKey` as if it returned a Buffer.
Check any override of `encryptPayload` or `decryptPayload`.

The thrown error changed because Web Crypto produces different errors than `node:crypto`.
A failed decryption previously threw `Unsupported state or unable to authenticate data` for aes-256-gcm or a padding error for aes-256-cbc.
Both modes now reject with `OperationError: The operation failed for an operation-specific reason`.
Code that only catches the error without matching message text requires no changes.
Behavior was verified against recorded fixtures in Bun 1.4.4.
