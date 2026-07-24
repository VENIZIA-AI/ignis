---
title: Crypto - Full Reference
description: Complete reference for AES, RSA, ECDH, the shared algorithm base classes, and every option
difficulty: intermediate
---

# Crypto - Full Reference

Exhaustive reference for `AES`, `RSA`, `ECDH`, the shared `AbstractCryptoAlgorithm`/`BaseCryptoAlgorithm` base classes, and the standalone `hash()` utility. For a readable introduction and the most common tasks, start with the [Crypto overview](/extensions/helpers/crypto/).

**Files:**

- [`packages/helpers/src/modules/crypto/algorithms/base.algorithm.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/crypto/algorithms/base.algorithm.ts) - `AbstractCryptoAlgorithm`, `BaseCryptoAlgorithm`
- [`packages/helpers/src/modules/crypto/algorithms/aes.algorithm.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/crypto/algorithms/aes.algorithm.ts) - `AES`, `AESAlgorithmType`
- [`packages/helpers/src/modules/crypto/algorithms/rsa.algorithm.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/crypto/algorithms/rsa.algorithm.ts) - `RSA`, `RSAAlgorithmType`
- [`packages/helpers/src/modules/crypto/algorithms/ecdh.algorithm.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/crypto/algorithms/ecdh.algorithm.ts) - `ECDH`, `ECDHAlgorithmType`, `IECDHEncryptedPayload`, `IECDHExtraOptions`
- [`packages/helpers/src/modules/crypto/common/types.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/crypto/common/types.ts) - `ICryptoAlgorithm`
- [`packages/helpers/src/modules/crypto/common/constants.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/crypto/common/constants.ts) - `DEFAULT_CIPHER_BITS`, `DEFAULT_PAD_END`
- [`packages/helpers/src/utilities/crypto.utility.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/utilities/crypto.utility.ts) - `hash()`

## Quick Reference

| Class | Extends | Secret type | Async | Runtime API |
|-------|---------|--------------|-------|-------------|
| `AES` | `BaseCryptoAlgorithm` | `string` | No | Node `node:crypto` |
| `RSA` | `BaseCryptoAlgorithm` | `string` (base64 DER key) | No | Node `node:crypto` |
| `ECDH` | `AbstractCryptoAlgorithm` | `CryptoKey` | Yes | Web Crypto (`crypto.subtle`) |
| `hash()` | _(standalone function)_ | `string` (HMAC secret, SHA256 only) | No | Node `node:crypto` |

### Import paths

```typescript
// Algorithm classes
import { AES, RSA, ECDH } from '@venizia/ignis-helpers';

// Hash utility function
import { hash } from '@venizia/ignis-helpers';

// Types
import type {
  AESAlgorithmType,
  RSAAlgorithmType,
  ECDHAlgorithmType,
  IECDHEncryptedPayload,
  IECDHExtraOptions,
  ICryptoAlgorithm,
} from '@venizia/ignis-helpers';
```

All of the above resolve through the root `@venizia/ignis-helpers` barrel, which re-exports `./modules` (and therefore `./modules/crypto`) and `./utilities` in full.

## Type Hierarchy

`Source ->` [`base.algorithm.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/crypto/algorithms/base.algorithm.ts)

```
ICryptoAlgorithm (interface)
  └── AbstractCryptoAlgorithm (extends BaseHelper)
        ├── BaseCryptoAlgorithm (adds normalizeSecretKey, getAlgorithmKeySize)
        │     ├── AES
        │     └── RSA
        └── ECDH (uses CryptoKey objects, not string secrets)
```

`ICryptoAlgorithm` carries 7 generic type parameters - the algorithm name literal, encrypt/decrypt input and output types, the secret key type, and an extra-options type:

```typescript
interface ICryptoAlgorithm<
  AlgorithmNameType extends string,
  EncryptInputType = unknown,
  DecryptInputType = unknown,
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

`AbstractCryptoAlgorithm` extends `BaseHelper` and declares `encrypt`/`decrypt` as abstract. It adds no behavior of its own. `BaseCryptoAlgorithm` is the concrete base for string-secret algorithms:

| Member | Signature | Description |
|--------|-----------|--------------|
| constructor | `(opts: { scope: string; algorithm: AlgorithmType })` | Sets `this.algorithm`, calls `validateAlgorithmName` |
| `validateAlgorithmName` | `(opts: { algorithm: AlgorithmType }) => void` | Throws if `algorithm` is empty/falsy |
| `normalizeSecretKey` | `(opts: { secret: string; length: number; padEnd?: string }) => string` | Truncates to `length`, or right-pads with `padEnd` (default `'0'`, the digit character - not a null byte) |
| `getAlgorithmKeySize` | `() => number` | Parses the bit size out of `this.algorithm` (e.g. `256` from `'aes-256-gcm'`), divides by 8 for byte length |

`ECDH` extends `AbstractCryptoAlgorithm` directly. It does not inherit `normalizeSecretKey` or `getAlgorithmKeySize` - its secrets are `CryptoKey` objects, not strings.

## AES

`Source ->` [`aes.algorithm.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/crypto/algorithms/aes.algorithm.ts)

```typescript
type AESAlgorithmType = 'aes-256-cbc' | 'aes-256-gcm';

const aes = AES.withAlgorithm('aes-256-gcm'); // or 'aes-256-cbc'
```

| Mode | Authenticated | Notes |
|------|----------------|-------|
| `aes-256-cbc` | No | Plain block cipher, no tamper detection |
| `aes-256-gcm` | Yes | Ciphertext includes a 16-byte GCM auth tag; tampering throws on decrypt |

### `encrypt`

```typescript
encrypt(opts: { message: string; secret: string; opts?: IAESExtraOptions }): string
```

| Option (`opts.opts`) | Type | Default | Description |
|-----------------------|------|---------|-------------|
| `iv` | `Buffer` | `crypto.randomBytes(16)` | Initialization vector |
| `inputEncoding` | `crypto.Encoding` | `'utf-8'` | Encoding of `message` |
| `outputEncoding` | `crypto.Encoding` | `'base64'` | Encoding of the returned ciphertext |
| `doThrow` | `boolean` | `true` | If `false`, returns the original `message` instead of throwing on error |

The secret is normalized via `normalizeSecretKey` to the algorithm's key size (32 bytes for both modes) before being used as the cipher key. The output layout is `IV [+ GCM auth tag] + ciphertext`, concatenated and encoded with `outputEncoding`.

```typescript
import C from 'node:crypto';

const encrypted = aes.encrypt({
  message: 'hello',
  secret: 'my-secret',
  opts: {
    iv: C.randomBytes(16),
    inputEncoding: 'utf-8',
    outputEncoding: 'hex',
    doThrow: false,
  },
});
```

### `decrypt`

```typescript
decrypt(opts: { message: string; secret: string; opts?: IAESExtraOptions }): string
```

| Option (`opts.opts`) | Type | Default | Description |
|-----------------------|------|---------|-------------|
| `iv` | `Buffer` | Extracted from the first 16 bytes of the decoded ciphertext | Initialization vector |
| `inputEncoding` | `crypto.Encoding` | `'base64'` | Encoding of `message` |
| `outputEncoding` | `crypto.Encoding` | `'utf-8'` | Encoding of the returned plaintext |
| `doThrow` | `boolean` | `true` | If `false`, returns the original `message` instead of throwing on error |

For `aes-256-gcm`, the next 16 bytes after the IV are read as the auth tag and passed to `setAuthTag` before the remaining bytes are treated as ciphertext.

> [!WARNING]
> Decrypting `aes-256-gcm` ciphertext with an `aes-256-cbc` instance (or vice versa) throws `Unsupported state or unable to authenticate data`. The two modes produce incompatible byte layouts - always encrypt and decrypt with the same one.

### `encryptFile` / `decryptFile`

```typescript
encryptFile(opts: { absolutePath: string; secret: string }): string
decryptFile(opts: { absolutePath: string; secret: string }): string
```

Both read the file synchronously via `fs.readFileSync`, decode it as UTF-8, then call `encrypt`/`decrypt` on the string content using default extra-options. If `absolutePath` is empty or falsy, both return `''` without touching the filesystem.

```typescript
const encrypted = aes.encryptFile({ absolutePath: '/path/to/config.json', secret: 'my-secret' });
const decrypted = aes.decryptFile({ absolutePath: '/path/to/config.json.enc', secret: 'my-secret' });
```

## RSA

`Source ->` [`rsa.algorithm.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/crypto/algorithms/rsa.algorithm.ts)

```typescript
type RSAAlgorithmType = 'rsa';

const rsa = RSA.withAlgorithm(); // no parameters - always algorithm 'rsa'
```

### `generateDERKeyPair`

```typescript
generateDERKeyPair(opts?: { modulus: number }): { publicKey: Buffer; privateKey: Buffer }
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `modulus` | `number` | `2048` | RSA modulus length in bits, passed to `crypto.generateKeyPairSync` |

`publicKey` is exported as `{ type: 'spki', format: 'der' }`, `privateKey` as `{ type: 'pkcs8', format: 'der' }`. Both are raw `Buffer`s. Base64-encode them (`.toString('base64')`) to pass as the `secret` string to `encrypt`/`decrypt`.

### `encrypt`

```typescript
encrypt(opts: { message: string; secret: string; opts?: IRSAExtraOptions }): string
```

`secret` is the base64-encoded public key (SPKI/DER). Internally builds a public key via `crypto.createPublicKey({ format: 'der', type: 'spki' })` and calls `crypto.publicEncrypt`.

| Option (`opts.opts`) | Type | Default | Description |
|-----------------------|------|---------|-------------|
| `inputEncoding.key` | `crypto.Encoding` | `'base64'` | Encoding of the `secret` key buffer |
| `inputEncoding.message` | `crypto.Encoding` | `'utf-8'` | Encoding of `message` |
| `outputEncoding` | `crypto.Encoding` | `'base64'` | Encoding of the returned ciphertext |
| `doThrow` | `boolean` | `true` | If `false`, returns the original `message` instead of throwing on error |

### `decrypt`

```typescript
decrypt(opts: { message: string; secret: string; opts?: IRSAExtraOptions }): string
```

`secret` is the base64-encoded private key (PKCS8/DER). Internally builds a private key via `crypto.createPrivateKey({ format: 'der', type: 'pkcs8' })` and calls `crypto.privateDecrypt`.

| Option (`opts.opts`) | Type | Default | Description |
|-----------------------|------|---------|-------------|
| `inputEncoding.key` | `crypto.Encoding` | `'base64'` | Encoding of the `secret` key buffer |
| `inputEncoding.message` | `crypto.Encoding` | `'base64'` | Encoding of `message` |
| `outputEncoding` | `crypto.Encoding` | `'utf-8'` | Encoding of the returned plaintext |
| `doThrow` | `boolean` | `true` | If `false`, returns the original `message` instead of throwing on error |

```typescript
const rsa = RSA.withAlgorithm();
const { publicKey, privateKey } = rsa.generateDERKeyPair({ modulus: 4096 });

const encrypted = rsa.encrypt({
  message: 'hello',
  secret: publicKey.toString('base64'),
  opts: { outputEncoding: 'hex', doThrow: false },
});

const decrypted = rsa.decrypt({
  message: encrypted,
  secret: privateKey.toString('base64'),
  opts: { inputEncoding: { key: 'base64', message: 'hex' } },
});
```

## ECDH Key Exchange

`Source ->` [`ecdh.algorithm.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/crypto/algorithms/ecdh.algorithm.ts)

`ECDH` implements ECDH P-256 key exchange with HKDF-derived AES-256-GCM session encryption, entirely on the Web Crypto API (`crypto.subtle`). Every method is `async`.

```typescript
const ecdh = ECDH.withAlgorithm(); // curve is always 'ecdh-p256'
const ecdhCustom = ECDH.withAlgorithm({ hkdfInfo: 'my-app-session-keys' });
```

| Constructor option | Type | Default | Description |
|---------------------|------|---------|-------------|
| `algorithm` | `'ecdh-p256'` | `'ecdh-p256'` | Accepted but not branched on - the curve is always P-256 |
| `hkdfInfo` | `string` | `'ignis-ecdh-p256-aes-256-gcm-v1'` | HKDF info string, UTF-8 encoded, used to isolate key derivation between application contexts |

Different `hkdfInfo` values produce **incompatible** derived keys from the same ECDH shared secret.

### Key generation and import

| Method | Signature | Description |
|--------|-----------|--------------|
| `generateKeyPair` | `() => Promise<{ keyPair: CryptoKeyPair; publicKeyB64: string }>` | `deriveBits`-only key pair (`extractable: false`); `publicKeyB64` is the raw exported public key, base64-encoded (65 bytes for P-256) |
| `importPublicKey` | `(opts: { rawKeyB64: string }) => Promise<CryptoKey>` | Imports a peer's raw base64 public key |

```typescript
const { keyPair, publicKeyB64 } = await ecdh.generateKeyPair();
const peerKey = await ecdh.importPublicKey({ rawKeyB64: peerPublicKeyB64 });
```

### `deriveAESKey`

```typescript
deriveAESKey(opts: {
  privateKey: CryptoKey;
  peerPublicKey: CryptoKey;
  salt?: string;
}): Promise<{ key: CryptoKey; salt: string }>
```

Derives shared bits via ECDH (`deriveBits`, 256 bits), imports them as an HKDF key, then derives a non-extractable AES-256-GCM `CryptoKey` via HKDF-SHA256 using `salt` and the instance's `hkdfInfo`.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `privateKey` | `CryptoKey` | - | Caller's ECDH private key from `generateKeyPair()` |
| `peerPublicKey` | `CryptoKey` | - | Peer's public key from `importPublicKey()` |
| `salt` | `string` | A random 32-byte salt is generated | Base64-encoded HKDF salt. Omit to generate a new random one |

> [!IMPORTANT]
> Both parties must use the **same salt** to derive matching keys. The initiator omits `salt` - a random one is generated and returned. The responder passes that returned `salt` back into their own `deriveAESKey` call. If both sides generate their own salt instead, the two keys never match.

### `encrypt` / `decrypt`

```typescript
encrypt(opts: { message: string; secret: CryptoKey; opts?: IECDHExtraOptions }): Promise<IECDHEncryptedPayload>
decrypt(opts: { message: IECDHEncryptedPayload; secret: CryptoKey; opts?: IECDHExtraOptions }): Promise<string>
```

`secret` is the `CryptoKey` returned by `deriveAESKey`. Uses AES-GCM with a random 12-byte IV per call and a 128-bit auth tag.

```typescript
interface IECDHEncryptedPayload {
  iv: string; // base64 encoded 12-byte IV
  ct: string; // base64 encoded ciphertext + 128-bit GCM auth tag
}

interface IECDHExtraOptions {
  additionalData?: string;
}
```

`opts.additionalData` (AAD) is authenticated but not encrypted. It binds the ciphertext to a context - a channel ID, a session ID - so it can't be replayed into a different one. Decrypt must supply the exact same `additionalData`. A mismatch throws, and so does omitting it when encrypt supplied one.

### Complete flow

```typescript
const ecdh = ECDH.withAlgorithm();

// 1. Both parties generate key pairs
const alice = await ecdh.generateKeyPair();
const bob = await ecdh.generateKeyPair();

// 2. Exchange public keys (safe to share over any channel)
const alicePubForBob = await ecdh.importPublicKey({ rawKeyB64: alice.publicKeyB64 });
const bobPubForAlice = await ecdh.importPublicKey({ rawKeyB64: bob.publicKeyB64 });

// 3. Initiator derives the AES key (generates a random salt)
const { key: aliceKey, salt } = await ecdh.deriveAESKey({
  privateKey: alice.keyPair.privateKey,
  peerPublicKey: bobPubForAlice,
});

// 4. Responder derives the SAME AES key using the initiator's salt
const { key: bobKey } = await ecdh.deriveAESKey({
  privateKey: bob.keyPair.privateKey,
  peerPublicKey: alicePubForBob,
  salt,
});

// 5. Alice encrypts, Bob decrypts (or vice versa)
const encrypted = await ecdh.encrypt({ message: 'Hello Bob!', secret: aliceKey });
const decrypted = await ecdh.decrypt({ message: encrypted, secret: bobKey });
// => 'Hello Bob!'
```

### Security properties

| Property | Guarantee |
|----------|-----------|
| Confidentiality | AES-256-GCM encryption |
| Integrity | GCM authentication tag - tampered ciphertext is detected on decrypt |
| Forward secrecy | Ephemeral, non-extractable key pairs - compromising one session does not compromise others |
| Key isolation | `hkdfInfo` separates key derivation across application contexts |
| Context binding | `additionalData` (AAD) prevents cross-context replay |

## Hashing

`Source ->` [`crypto.utility.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/utilities/crypto.utility.ts)

`hash()` is a standalone function, not a class - it isn't part of the `AES`/`RSA`/`ECDH` hierarchy. It's exported from `packages/helpers/src/utilities`, not `modules/crypto`. It is documented in full on the [Crypto Utility reference](/references/utilities/crypto).

```typescript
function hash(
  text: string,
  options: {
    algorithm: 'SHA256' | 'MD5';
    secret?: string;
    outputType: C.BinaryToTextEncoding; // 'hex' | 'base64' | 'base64url' | 'latin1'
  },
): string;
```

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `algorithm` | `'SHA256' \| 'MD5'` | Yes | Hashing algorithm |
| `secret` | `string` | Only for `SHA256` | HMAC secret key; ignored for `MD5` |
| `outputType` | `'hex' \| 'base64' \| 'base64url' \| 'latin1'` | Yes | Digest output encoding |

> [!WARNING]
> `SHA256` uses `createHmac` and **requires** `secret`. If `secret` is `undefined`, the function short-circuits and returns `text` unchanged - no hash is computed, no error is thrown. `MD5` never needs a secret and always hashes.

```typescript
import { hash } from '@venizia/ignis-helpers';

const md5Hash = hash('some text', { algorithm: 'MD5', outputType: 'hex' });
const sha256Hmac = hash('some text', { algorithm: 'SHA256', secret: 'a-secret-key', outputType: 'hex' });
```

## API Summary

| Method | Class | Returns | Description |
|--------|-------|---------|-------------|
| `AES.withAlgorithm(algorithm)` | `AES` | `AES` | Create an AES instance with CBC or GCM mode |
| `encrypt(opts)` | `AES` | `string` | Encrypt a string message |
| `decrypt(opts)` | `AES` | `string` | Decrypt a ciphertext string |
| `encryptFile(opts)` | `AES` | `string` | Encrypt file contents to a string |
| `decryptFile(opts)` | `AES` | `string` | Decrypt file contents to a string |
| `RSA.withAlgorithm()` | `RSA` | `RSA` | Create an RSA instance |
| `generateDERKeyPair(opts?)` | `RSA` | `{ publicKey: Buffer; privateKey: Buffer }` | Generate a DER-format key pair |
| `encrypt(opts)` | `RSA` | `string` | Encrypt with a public key |
| `decrypt(opts)` | `RSA` | `string` | Decrypt with a private key |
| `ECDH.withAlgorithm(opts?)` | `ECDH` | `ECDH` | Create an ECDH instance with optional `hkdfInfo` |
| `generateKeyPair()` | `ECDH` | `Promise<{ keyPair: CryptoKeyPair; publicKeyB64: string }>` | Generate a P-256 key pair |
| `importPublicKey(opts)` | `ECDH` | `Promise<CryptoKey>` | Import a peer's base64 public key |
| `deriveAESKey(opts)` | `ECDH` | `Promise<{ key: CryptoKey; salt: string }>` | Derive an AES-256-GCM key via HKDF |
| `encrypt(opts)` | `ECDH` | `Promise<IECDHEncryptedPayload>` | Encrypt with a derived AES key |
| `decrypt(opts)` | `ECDH` | `Promise<string>` | Decrypt with a derived AES key |
| `hash(text, options)` | _(function)_ | `string` | MD5 digest or HMAC-SHA256 |

## Troubleshooting

### "[validateAlgorithmName] Invalid algorithm name | algorithm: undefined"

**Cause:** An empty or undefined `algorithm` was passed to the constructor (or `withAlgorithm()`).

**Fix:**

```typescript
const aes = AES.withAlgorithm('aes-256-gcm'); // not undefined or empty
const rsa = RSA.withAlgorithm();               // no parameter needed
const ecdh = ECDH.withAlgorithm();             // no parameter needed
```

### "[ECDH.fromBase64] Invalid base64 input"

**Cause:** A value passed to an ECDH method - a public key, salt, IV, or ciphertext - is not valid base64. Its length isn't divisible by 4, or it has characters outside `A-Za-z0-9+/=`.

**Fix:** Pass base64 strings through exactly as produced by the methods that generated them (`publicKeyB64`, `salt`, `iv`, `ct`). Do not trim, re-encode, or modify them.

### "Unsupported state or unable to authenticate data"

**Cause:** Either the ciphertext or auth tag was modified in transit, or encrypt and decrypt used different algorithm modes - the two modes produce incompatible byte layouts.

**Fix:** Use the same algorithm mode for both encrypt and decrypt.

### ECDH decrypt throws even though both sides imported each other's public keys

**Cause:** Each `deriveAESKey` call without a `salt` generates a new random 32-byte salt. If both sides generate their own, they derive different AES keys.

**Fix:** The initiator calls `deriveAESKey` without `salt` and sends the returned `salt` to the responder. The responder passes that exact `salt` into their own `deriveAESKey` call.

### SHA256 hash returns the original text instead of a hash

**Cause:** `hash()` with `algorithm: 'SHA256'` requires `secret`. When `secret` is `undefined`, it short-circuits and returns `text` unchanged.

**Fix:**

```typescript
const hashed = hash('text', { algorithm: 'SHA256', secret: 'my-hmac-key', outputType: 'hex' });
```

## See also

- [Crypto overview](/extensions/helpers/crypto/) - introduction and the most common tasks
- [Crypto Utility](/references/utilities/crypto) - full `hash()` reference
- [Authentication Component](/extensions/components/authentication/) - JWT and password verification
- [Security Guidelines](/best-practices/security-guidelines) - cryptographic best practices
