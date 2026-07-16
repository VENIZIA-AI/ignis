---
title: Crypto
description: AES symmetric encryption, RSA asymmetric encryption, and ECDH key exchange helpers
difficulty: intermediate
---

# Crypto

Cryptographic helpers for AES symmetric encryption, RSA asymmetric encryption, and ECDH ephemeral key exchange, each wrapped in a scoped `BaseHelper` class.

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

`RSA` and `ECDH` follow the same `withAlgorithm()` factory + `encrypt`/`decrypt` shape - only the secret type and speed/message-size trade-offs differ.

## How it works

- **One factory pattern.** Every algorithm class exposes a static `withAlgorithm()` that returns an instance; there is no public constructor to call directly.
- **`AES` and `RSA` share `BaseCryptoAlgorithm`.** It adds `normalizeSecretKey()` (pads/truncates a string secret to the algorithm's key size) and `getAlgorithmKeySize()` (parses the bit size out of the algorithm name, e.g. `256` from `aes-256-gcm`).
- **`ECDH` extends the neutral `AbstractCryptoAlgorithm` directly.** It uses `CryptoKey` objects from the Web Crypto API (`crypto.subtle`), not string secrets, so it skips the string-normalization helpers entirely.
- **Options objects, throw-by-default.** Every `encrypt`/`decrypt` takes `{ message, secret, opts? }`. On internal error, each throws unless `opts.doThrow: false`, in which case the original input is returned unchanged.

**Class comparison**

| Class | Base class | Secret type | Async | Best for |
|-------|-----------|--------------|-------|----------|
| `AES` | `BaseCryptoAlgorithm` | `string` | No | Encrypting data at rest, fast bulk encryption |
| `RSA` | `BaseCryptoAlgorithm` | `string` (base64 DER key) | No | Public-key encryption, small payloads |
| `ECDH` | `AbstractCryptoAlgorithm` | `CryptoKey` | Yes | Session key exchange with forward secrecy |

`AES` supports two modes selected at construction: `aes-256-cbc` (plain block cipher) and `aes-256-gcm` (authenticated - detects tampering). Everything on this page uses the default options; the [Full reference](/extensions/helpers/crypto/reference) covers every option, the ECDH key-exchange flow, `IECDHEncryptedPayload`, and the standalone `hash()` utility that lives alongside these classes in the same package.

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

Keys are DER-encoded (`SPKI` public, `PKCS8` private); base64-encode them to pass as the `secret` string.

```typescript
import { RSA } from '@venizia/ignis-helpers';

const rsa = RSA.withAlgorithm();
const { publicKey, privateKey } = rsa.generateDERKeyPair(); // default 2048-bit modulus

const encrypted = rsa.encrypt({ message: 'secret data', secret: publicKey.toString('base64') });
const decrypted = rsa.decrypt({ message: encrypted, secret: privateKey.toString('base64') });
// => 'secret data'
```

### Fail soft instead of throwing

Pass `opts: { doThrow: false }` to get the original message back on error instead of an exception - useful when decryption failure should be a fallback path, not a crash.

```typescript
const result = rsa.encrypt({ message: 'test', secret: 'invalid-key', opts: { doThrow: false } });
// result === 'test' (original message, no throw)
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

- [Full reference](/extensions/helpers/crypto/reference) - every option, the ECDH flow, `hash()`, and troubleshooting
- [Crypto Utility](/references/utilities/crypto) - the standalone `hash()` function for MD5/HMAC-SHA256
- [Authentication Component](/extensions/components/authentication/) - JWT and password verification
- [Helpers Overview](/extensions/helpers/) - all available helpers
- [Security Guidelines](/best-practices/security-guidelines) - cryptographic best practices

**Files:**

- [`packages/helpers/src/modules/crypto/algorithms/base.algorithm.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/crypto/algorithms/base.algorithm.ts) - `AbstractCryptoAlgorithm`, `BaseCryptoAlgorithm`
- [`packages/helpers/src/modules/crypto/algorithms/aes.algorithm.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/crypto/algorithms/aes.algorithm.ts) - `AES`
- [`packages/helpers/src/modules/crypto/algorithms/rsa.algorithm.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/crypto/algorithms/rsa.algorithm.ts) - `RSA`
- [`packages/helpers/src/modules/crypto/algorithms/ecdh.algorithm.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/crypto/algorithms/ecdh.algorithm.ts) - `ECDH`
