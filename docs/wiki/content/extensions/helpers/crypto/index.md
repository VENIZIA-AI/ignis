---
title: Crypto
description: AES symmetric encryption, RSA asymmetric encryption, ECDH key exchange, and Hash digests/HMACs
difficulty: intermediate
---

# Crypto

Cryptographic helpers for AES symmetric encryption, RSA asymmetric encryption, ECDH ephemeral key exchange, and `Hash` digests/HMACs, each wrapped in a scoped `BaseHelper` class.

## In one example

The smallest real use: encrypt and decrypt a string with AES-256-GCM.

```typescript
import { AES } from '@venizia/ignis-helpers';

const aes = AES.withAlgorithm('aes-256-gcm');
const secret = 'my-application-secret-key';

const encrypted = aes.encrypt({ message: 'This is a secret message.', secret });
// => base64 encoded string containing IV + auth tag + ciphertext

const decrypted = aes.decrypt({ message: encrypted, secret });
// => 'This is a secret message.'
```

`RSA` and `ECDH` follow the same `withAlgorithm()` factory + `encrypt`/`decrypt` shape. Only the secret type and the speed/message-size trade-offs differ.

## How it works

- **One factory pattern.** Every algorithm class exposes a static `withAlgorithm()` that returns an instance. There is no public constructor to call directly.
- **`ECDH` extends the neutral `AbstractCryptoAlgorithm` directly.** It uses `CryptoKey` objects from the Web Crypto API (`crypto.subtle`), not string secrets. It skips the string-normalization helpers entirely.
- **Options objects, throw-by-default.** Every `encrypt`/`decrypt` takes `{ message, secret, opts? }`. On internal error, each throws by default. Pass `opts.doThrow: false` to get the original input back unchanged instead.

**`AES` and `RSA` share `BaseCryptoAlgorithm`**, which adds two helpers:

| Method | Does |
|---|---|
| `normalizeSecretKey()` | Pads or truncates a string secret to the algorithm's key size |
| `getAlgorithmKeySize()` | Parses the bit size out of the algorithm name - `256` from `aes-256-gcm` |

**Class comparison**

| Class | Base class | Secret type | Async | Best for |
|-------|-----------|--------------|-------|----------|
| `AES` | `BaseCryptoAlgorithm` | `string` | No | Encrypting data at rest, fast bulk encryption |
| `RSA` | `BaseCryptoAlgorithm` | `string` (base64 DER key) | No | Public-key encryption, small payloads |
| `ECDH` | `AbstractCryptoAlgorithm` | `CryptoKey` | Yes | Session key exchange with forward secrecy |
| `Hash` | `BaseHelper` | `string` (HMAC only, no secret for a plain digest) | No | Digests and HMACs - no `decrypt`, a digest cannot be reversed |

`AES` supports two modes selected at construction: `aes-256-cbc` (plain block cipher) and `aes-256-gcm` (authenticated - detects tampering). Everything on this page uses the default options.

See the [Full reference](/extensions/helpers/crypto/reference) for every option, the ECDH key-exchange flow, `IECDHEncryptedPayload`, and `Hash`'s digest/HMAC methods.

## Common tasks

### Choose an AES mode

`aes-256-gcm` is authenticated encryption - tampering makes decryption throw instead of returning corrupted data. Prefer it for new code.

```typescript
const aesGcm = AES.withAlgorithm('aes-256-gcm'); // recommended
const aesCbc = AES.withAlgorithm('aes-256-cbc'); // no tamper detection
```

### Encrypt a file

`encryptFile`/`decryptFile` read the file synchronously, treat its contents as UTF-8, then run the same `encrypt`/`decrypt` as strings.

```typescript
const encrypted = aes.encryptFile({ absolutePath: '/path/to/config.json', secret });
const decrypted = aes.decryptFile({ absolutePath: '/path/to/config.json.enc', secret });
```

### Generate an RSA key pair and encrypt with it

Keys are DER-encoded (`SPKI` public, `PKCS8` private). Base64-encode them to pass as the `secret` string.

```typescript
import { RSA } from '@venizia/ignis-helpers';

const rsa = RSA.withAlgorithm();
const { publicKey, privateKey } = rsa.generateDERKeyPair(); // default 2048-bit modulus

const encrypted = rsa.encrypt({ message: 'secret data', secret: publicKey.toString('base64') });
const decrypted = rsa.decrypt({ message: encrypted, secret: privateKey.toString('base64') });
// => 'secret data'
```

### Fail soft instead of throwing

Pass `opts: { doThrow: false }` to get the original message back on error instead of an exception. Use this when a decryption failure should be a fallback path, not a crash.

```typescript
const result = rsa.encrypt({ message: 'test', secret: 'invalid-key', opts: { doThrow: false } });
// result === 'test' (original message, no throw)
```

### Hash or HMAC a message

`Hash` covers one-way digests and keyed HMACs. `digest` takes no secret; `hmac` requires one and throws if it is empty.

```typescript
import { Hash, HashAlgorithms } from '@venizia/ignis-helpers';

const checksum = Hash.withAlgorithm(HashAlgorithms.SHA256).digest({ message: 'payload' });
const signature = Hash.withAlgorithm(HashAlgorithms.SHA256).hmac({ message: 'payload', secret: webhookSecret });
```

### Derive a shared session key with ECDH

`ECDH` is async (Web Crypto) and needs a `deriveAESKey()` step before either side can encrypt. See the [Full reference](/extensions/helpers/crypto/reference#ecdh-key-exchange) for the complete key-exchange flow, salt handling, and additional authenticated data (AAD).

```typescript
import { ECDH } from '@venizia/ignis-helpers';

const ecdh = ECDH.withAlgorithm();
const alice = await ecdh.generateKeyPair();
const bob = await ecdh.generateKeyPair();
```

## See also

- [Full reference](/extensions/helpers/crypto/reference) - every option, the ECDH flow, `Hash`, and troubleshooting
- [Authentication Component](/extensions/components/authentication/) - JWT and password verification
- [Helpers Overview](/extensions/helpers/) - all available helpers
- [Security Guidelines](/best-practices/security-guidelines) - cryptographic best practices

**Files:**

- [`packages/helpers/src/modules/crypto/algorithms/base.algorithm.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/crypto/algorithms/base.algorithm.ts) - `AbstractCryptoAlgorithm`, `BaseCryptoAlgorithm`
- [`packages/helpers/src/modules/crypto/algorithms/aes.algorithm.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/crypto/algorithms/aes.algorithm.ts) - `AES`
- [`packages/helpers/src/modules/crypto/algorithms/rsa.algorithm.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/crypto/algorithms/rsa.algorithm.ts) - `RSA`
- [`packages/helpers/src/modules/crypto/algorithms/ecdh.algorithm.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/crypto/algorithms/ecdh.algorithm.ts) - `ECDH`
- [`packages/helpers/src/modules/crypto/algorithms/hash.algorithm.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/crypto/algorithms/hash.algorithm.ts) - `Hash`
