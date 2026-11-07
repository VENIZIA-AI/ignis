---
title: AES and RSA never return the input on failure
description: "The doThrow option of AES and RSA encrypt and decrypt is removed. A failure always throws, and passing doThrow is refused."
packages: ['@venizia/ignis-helpers', '@venizia/ignis']
---

# Changelog - 2026-11-07

## AES and RSA never return the input on failure

<Badge type="danger" text="Security" /> <Badge type="warning" text="Breaking Change" />

**In one line.** With `doThrow: false`, a failed `encrypt` or `decrypt` returned its own input unchanged, which a caller could take for ciphertext or plaintext. The option is removed: a failure always throws.

## What changed

- **A failure throws.** `AES.encrypt`, `AES.decrypt`, `RSA.encrypt` and `RSA.decrypt` throw on a wrong key, a damaged ciphertext, a bad key format or a bad IV. Nothing is returned in place of the result.
- **`doThrow` is refused.** The option is gone from the types. A call that still passes it, with any value, throws `The doThrow option was removed`, so a caller that relied on the fallback finds out at once instead of reading an error as data.
- **Unchanged.** The ciphertext format, key derivation and every successful result are as before.

## Who is affected

- **Callers that pass `doThrow: false`.** They now get an exception. Catch it where the fallback is wanted, and do not treat the input as the result.
- **Callers that pass `doThrow: true`.** Remove the option: it is refused as well.
- **Everyone else.** No action needed.

## Breaking changes

> [!WARNING]
> A call to `encrypt` or `decrypt` of `AES` or `RSA` that passes `doThrow` throws.

**Before:**

```typescript
const result = await rsa.decrypt({ message, secret, opts: { doThrow: false } });
// on a failure, result is the ciphertext itself
```

**After:**

```typescript
try {
  const plain = await rsa.decrypt({ message, secret });
  // use plain
} catch (error) {
  // the message was not sealed for this key: take the fallback path
}
```

## Details

| File | Package |
|------|---------|
| `src/modules/crypto/algorithms/aes.algorithm.ts` | helpers |
| `src/modules/crypto/algorithms/rsa.algorithm.ts` | helpers |
| `src/modules/crypto/algorithms/base.algorithm.ts` | helpers |
