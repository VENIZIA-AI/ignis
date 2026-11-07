---
title: AES uses a fresh random IV for every encryption
description: "AES.encrypt no longer accepts an iv option: every encryption draws a fresh random IV, and decrypt reads it from the ciphertext. Passing iv is refused. Existing ciphertext still decrypts."
packages: ['@venizia/ignis-helpers', '@venizia/ignis']
---

# Changelog - 2026-11-07

## AES uses a fresh random IV for every encryption

<Badge type="danger" text="Security" /> <Badge type="warning" text="Breaking Change" />

**In one line.** `AES.encrypt` took a caller-chosen `iv`. An IV reused under `aes-256-gcm` breaks confidentiality and integrity, so the option is removed: every encryption draws a fresh random IV.

## What changed

- **No `iv` option.** `AES.encrypt` draws 16 random bytes from `crypto.getRandomValues` on every call and writes them into the ciphertext, as it already did when no `iv` was passed.
- **Passing `iv` is refused.** A call to `encrypt` or `decrypt` that passes `iv` throws `The iv option was removed`, so nobody believes a chosen IV is still used. `decrypt` used to ignore a supplied `iv` without a word; it refuses it now too.
- **Existing ciphertext still decrypts.** `decrypt` reads the IV from the ciphertext, and that is unchanged, so what was written under a fixed IV, in the same format, still reads. Tests cover an envelope sealed under a constant IV, for `aes-256-cbc` and `aes-256-gcm`, and the recorded fixtures.
- **Not readable, and never was since 3 August 2026.** Ciphertext written before the PBKDF2 key derivation and key ids (commit `5ea37908`, the scheme where the key was the secret padded or truncated) is rejected on its version byte by `decrypt`. That did not change here.
- **Unchanged.** The ciphertext format, key derivation, keyrings, `kdfSalt` and `kdfIterations`, and every other option.

## Who is affected

- **Callers that pass `iv` to `AES.encrypt`.** They get an exception. Remove the option; the IV is chosen for them and stored in the ciphertext.
- **Callers that pass `iv` to `decrypt`.** It was ignored; it is refused now. Remove it.
- **Tests that relied on a fixed IV for a known output.** Stub `crypto.getRandomValues` for the call, or compare by decrypting.
- **Everyone else.** No action needed.

## Breaking changes

> [!WARNING]
> A call to `AES.encrypt` or `AES.decrypt` that passes `iv` throws.

**Before:**

```typescript
const sealed = await aes.encrypt({ message, secret, opts: { iv: someBuffer } });
```

**After:**

```typescript
const sealed = await aes.encrypt({ message, secret });
const plain = await aes.decrypt({ message: sealed, secret }); // reads the IV from `sealed`
```

## Details

| File | Package |
|------|---------|
| `src/modules/crypto/algorithms/aes.algorithm.ts` | helpers |
| `src/modules/crypto/algorithms/base.algorithm.ts` | helpers |
