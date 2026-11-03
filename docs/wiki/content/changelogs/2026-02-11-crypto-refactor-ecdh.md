---
title: Crypto Algorithm Refactor & ECDH
description: AES and RSA now take a single options object like ECDH, and ECDH joins the common crypto type hierarchy, which needs a small code update.
packages: ['@venizia/ignis-helpers']
---

# Changelog - 2026-02-11

## Crypto Algorithm Refactor & ECDH Key Exchange

**In one line.** All crypto algorithms now share one options-object API, and `ECDH` is a full member of the crypto type hierarchy.

## What changed

- **Options-object API.** `encrypt()` and `decrypt()` on AES and RSA take `{ message, secret, opts? }` instead of positional arguments. `encryptFile()` and `decryptFile()` take `{ absolutePath, secret }`.
- **`ECDH` extends `AbstractCryptoAlgorithm`.** It gets scoped logging, an `algorithm` field (`'ecdh-p256'`) and is exported from `@venizia/ignis-helpers` next to AES and RSA. It uses the Web Crypto API, so it works in Bun and browsers.
- **Seven generic parameters.** `ICryptoAlgorithm` splits `MessageType` into `EncryptInputType` and `DecryptInputType`, because ECDH encrypts strings but decrypts `IECDHEncryptedPayload` objects.
- **New ECDH default.** The HKDF info default is now `'ignis-ecdh-aes-gcm'`.

## Who is affected

- **Code that calls AES or RSA `encrypt()` / `decrypt()`.** Update every call (see Migration).
- **Code that extends `BaseCryptoAlgorithm` or implements `ICryptoAlgorithm`.** Add the extra generic parameter.
- **Code that uses `ECDH`.** It now uses the options-object API and the HKDF info default changed (above); check your calls.

## Breaking changes

> [!WARNING]
> Every AES and RSA `encrypt()` / `decrypt()` call, and every custom crypto subclass, must be updated.

**Before:**

```typescript
aes.encrypt(message, secret);
aes.decrypt(encrypted, secret);
aes.encrypt(message, secret, { iv, inputEncoding, outputEncoding });
rsa.encrypt(message, publicKey);
rsa.decrypt(encrypted, privateKey);

// 6 params
ICryptoAlgorithm<AlgorithmNameType, MessageType, SecretKeyType, EncryptReturnType, DecryptReturnType, ExtraOptions>
```

**After:**

```typescript
aes.encrypt({ message, secret });
aes.decrypt({ message: encrypted, secret });
aes.encrypt({ message, secret, opts: { iv, inputEncoding, outputEncoding } });
rsa.encrypt({ message, secret: publicKey });
rsa.decrypt({ message: encrypted, secret: privateKey });

// 7 params
ICryptoAlgorithm<AlgorithmNameType, EncryptInputType, DecryptInputType, SecretKeyType, EncryptReturnType, DecryptReturnType, ExtraOptions>
```

## Migration

1. Convert every AES and RSA `encrypt` / `decrypt` call from positional arguments to the options object (above).
2. Move any third-argument options into the `opts` property.
3. If you extended `BaseCryptoAlgorithm`, add the extra generic parameter:

```typescript
// Before (6 params)
class MyAlgo extends BaseCryptoAlgorithm<MyType, string, string, string, string, IMyOptions> {}

// After (7 params)
class MyAlgo extends BaseCryptoAlgorithm<MyType, string, string, string, string, string, IMyOptions> {}
```

## Details

```typescript
const ecdh = ECDH.withAlgorithm();

const alice = await ecdh.generateKeyPair();
const bob = await ecdh.generateKeyPair();

const bobPub = await ecdh.importPublicKey({ rawKeyB64: bob.publicKeyB64 });
const aliceKey = await ecdh.deriveAESKey({
  privateKey: alice.keyPair.privateKey,
  peerPublicKey: bobPub,
});

const encrypted = await ecdh.encrypt({ message: 'Hello!', secret: aliceKey });
```
