---
title: LegacyAES and the cipher option of the token services are removed
description: "LegacyAES, IPayloadCipher, DEFAULT_PAD_END and the cipher option of the JWS and JWKS token services are removed; ciphertext in the pre-PBKDF2 format has no reader any more, so re-encrypt it before you update."
packages: ['@venizia/ignis-helpers', '@venizia/ignis-kernel', '@venizia/ignis']
---

# Changelog - 2026-11-02

## LegacyAES and the cipher option of the token services are removed

<Badge type="warning" text="Breaking Change" />

**In one line.** `AES` is the only AES class now, so anything still stored in the pre-PBKDF2 format cannot be read after the update; re-encrypt it first.

## What changed

- **`LegacyAES` is removed** from `@venizia/ignis-helpers`. It read the format that came before the PBKDF2 envelope: the key was the secret padded with a NUL character (or cut) to the key size, there was no version byte, and the text was `IV [+ GCM tag] + ciphertext`.
- **`IPayloadCipher` is removed** from `@venizia/ignis-helpers` and `@venizia/ignis-helpers/core`, and **`DEFAULT_PAD_END` is removed.** Nothing but `LegacyAES` used them.
- **The `cipher` option is removed** from `IJWSTokenServiceOptions`, `IJWKSIssuerOptions` and `IJWKSVerifierOptions` (`@venizia/ignis-kernel`, `@venizia/ignis`). The token services always use `AES` with the `aesAlgorithm` you pass.
- **What stays.** `AES` still reads everything it wrote before, byte for byte, and the RSA, hash, `kdfSalt` and `kdfIterations` defaults are unchanged.

## Who is affected

- **Code that imports `LegacyAES`, `IPayloadCipher` or `DEFAULT_PAD_END`.** It stops compiling.
- **Apps that pass `cipher` to a token service.** The option is a type error. Tokens issued under the old envelope no longer decrypt, so those sessions end and users sign in again.
- **Apps that hold data written by `LegacyAES`.** Decrypt it and write it again with `AES` before you update (see Details).
- **Everyone else.** No action needed.

## Breaking changes

> [!WARNING]
> Code that imports a removed name, or passes `cipher` to a token service, fails to compile after the update.

**Before:**

```typescript
import { LegacyAES } from '@venizia/ignis-helpers';

const legacy = LegacyAES.withAlgorithm('aes-256-cbc');
const plain = await legacy.decrypt({ message: stored, secret: APPLICATION_SECRET });

new JWSTokenService({
  jwtSecret,
  getTokenExpiresFn,
  applicationSecret,
  cipher: LegacyAES.withAlgorithm('aes-256-cbc'),
});
```

**After:**

```typescript
import { AES } from '@venizia/ignis-helpers';

const aes = AES.withAlgorithm('aes-256-cbc');
const plain = await aes.decrypt({ message: stored, secret: APPLICATION_SECRET });

new JWSTokenService({ jwtSecret, getTokenExpiresFn, applicationSecret });
```

To upgrade:

1. Find what is still stored in the old format: a value that does not start with the `AES` version byte and decrypts with `LegacyAES`.
2. On the release you run now, decrypt it with `LegacyAES` and write it back with `AES`.
3. Remove `cipher` from every token service option.
4. Update, and run your typecheck.

## Details

- `AES` rejects the old format on its version byte, and `LegacyAES` failed the auth tag on the new one, so the two never read each other's data; nothing was ever converted for you.
- The IV rules of `AES` are unchanged: a 16-byte IV, a 16-byte GCM tag, and the tag before the ciphertext in the stored text.
