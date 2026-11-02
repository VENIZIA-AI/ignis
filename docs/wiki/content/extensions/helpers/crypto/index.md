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

const encrypted = await aes.encrypt({ message: 'This is a secret message.', secret });
// => base64 envelope: [version][idLen][id][iv][authTag][ciphertext]

const decrypted = await aes.decrypt({ message: encrypted, secret });
// => 'This is a secret message.'
```

`AES` and `RSA` are async: `encrypt`, `decrypt`, `encryptFile`, `decryptFile` and `generateDERKeyPair` return a Promise over `crypto.subtle`, so `await` them.

`RSA` and `ECDH` follow the same `withAlgorithm()` factory + `encrypt`/`decrypt` shape. Only the secret type and the speed/message-size trade-offs differ.

## How it works

- **One factory pattern.** Every algorithm class exposes a static `withAlgorithm()` that returns an instance. The constructors are public too, so `new AES({ algorithm: 'aes-256-gcm' })` works. Prefer the factory; it is what the rest of the framework calls.
- **`ECDH` extends the neutral `AbstractCryptoAlgorithm` directly.** It uses `CryptoKey` objects from the Web Crypto API (`crypto.subtle`), not string secrets. It skips the string-normalization helpers entirely. It needs no `node:crypto`, so a browser imports it from `@venizia/ignis-helpers/core` and talks to a server `ECDH` in the same wire format.
- **Options objects, throw-by-default.** Every `encrypt`/`decrypt` takes `{ message, secret, opts? }`. On internal error, each throws by default. Pass `opts.doThrow: false` to get the original input back unchanged instead.

**`AES` and `RSA` share `BaseCryptoAlgorithm`**, which adds two helpers:

| Method | Does |
|---|---|
| `normalizeSecretKey()` | Derives a key from your secret with PBKDF2-SHA256, 100,000 iterations. It never pads and never truncates |
| `getAlgorithmKeySize()` | Parses the bit size out of the algorithm name and returns it in **bytes** - `32` from `aes-256-gcm`, not `256` |

`normalizeSecretKey()` takes `{ secret, length, kdfSalt?, kdfIterations? }` and returns a `Promise<Buffer>` of `length` bytes.

| Option | Type | Default | Meaning |
|---|---|---|---|
| `kdfSalt` | `string` | `'ignis-kdf-salt-v1'` | Per-deployment PBKDF2 salt. Must be at least 16 bytes, or the call throws |
| `kdfIterations` | `number` | `100000` | PBKDF2 iteration count |

> [!WARNING]
> `kdfSalt` and `kdfIterations` are part of the key. Whatever you pass on encrypt you must pass again on decrypt, or the derived key differs and the ciphertext will not open. Omit both for the shipped defaults.

The shipped salt is public and identical in every deployment, so it defeats a bare dictionary attack but not a table precomputed against that value. Pass your own `kdfSalt` for per-deployment isolation. Derived keys are memoised per secret, salt, iteration count and length, so repeated calls do not repeat the 100,000 rounds.

The pad-or-truncate behaviour that predates this lives on `LegacyAES.normalizeSecretKeyLegacy` and nowhere else. It exists so data already written in the old envelope stays readable.

**Class comparison**

| Class | Base class | Secret type | Async | Best for |
|-------|-----------|--------------|-------|----------|
| `AES` | `BaseCryptoAlgorithm` | `TAESSecret` - a `string` or an `IAESKeyringEntry[]` | Yes | Encrypting data at rest, fast bulk encryption |
| `RSA` | `BaseCryptoAlgorithm` | `string` (base64 DER key) | Yes | Public-key encryption, small payloads |
| `ECDH` | `AbstractCryptoAlgorithm` | `CryptoKey` | Yes | Session key exchange with forward secrecy |
| `Hash` | `BaseHelper` | `string` (HMAC only, no secret for a plain digest) | No | Digests and HMACs - no `decrypt`, a digest cannot be reversed |
| `CredentialHelper` | none (static methods) | none | Yes | Storing and checking passwords: argon2id or bcrypt over `Bun.password` |

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

`encryptFile`/`decryptFile` read the file synchronously, treat its contents as UTF-8, then run the same `encrypt`/`decrypt` as strings and resolve to the result. They take `{ absolutePath, secret }` and nothing else, so they always use the default salt and iteration count. Read the file yourself and call `encrypt` if you need a custom `kdfSalt`.

```typescript
const encrypted = await aes.encryptFile({ absolutePath: '/path/to/config.json', secret });
const decrypted = await aes.decryptFile({ absolutePath: '/path/to/config.json.enc', secret });
```

### Generate an RSA key pair and encrypt with it

Keys are DER-encoded (`SPKI` public, `PKCS8` private). Base64-encode them to pass as the `secret` string.

```typescript
import { RSA } from '@venizia/ignis-helpers';

const rsa = RSA.withAlgorithm();
const { publicKey, privateKey } = await rsa.generateDERKeyPair(); // default 2048-bit modulus

const encrypted = await rsa.encrypt({ message: 'secret data', secret: publicKey.toString('base64') });
const decrypted = await rsa.decrypt({ message: encrypted, secret: privateKey.toString('base64') });
// => 'secret data'
```

### Fail soft instead of throwing

Pass `opts: { doThrow: false }` to get the original message back on error instead of an exception. Use this when a decryption failure should be a fallback path, not a crash.

```typescript
const result = await rsa.encrypt({ message: 'test', secret: 'invalid-key', opts: { doThrow: false } });
// result === 'test' (original message, no throw)
```

### Hash or HMAC a message

`Hash` covers one-way digests and keyed HMACs. `digest` takes no secret; `hmac` requires one and throws if it is empty. The message (and the HMAC secret) may be text or bytes, and `digest` takes several parts hashed in order as one message, for example a git blob header and the bytes.

```typescript
import { Hash, HashAlgorithms } from '@venizia/ignis-helpers';

const checksum = Hash.withAlgorithm(HashAlgorithms.SHA256).digest({ message: 'payload' });
const signature = Hash.withAlgorithm(HashAlgorithms.SHA256).hmac({ message: 'payload', secret: webhookSecret });

// Bytes and several parts: a Buffer key signs exactly like the text of the same bytes.
const gitBlobId = Hash.withAlgorithm(HashAlgorithms.SHA1).digest({
  message: [`blob ${content.length}\0`, content],
});
const token = Hash.withAlgorithm(HashAlgorithms.SHA256).hmac({ message: 'payload', secret: keyBytes });
```

### Store and check a password

`CredentialHelper` writes an argon2id hash (`$argon2id$`, the default parameters of `Bun.password`). Pass `algorithm: 'bcrypt'` to write bcrypt instead (`$2b$`, 60 characters, cost 10 unless you pass `cost`, 4 to 31; `cost` with argon2id throws). It reads every existing bcrypt and argon2 hash, including the ones the `bcrypt` package wrote, so no stored password is rehashed. It needs Bun. Never use `Hash` for a password: a digest is fast, a password hash is slow on purpose.

```typescript
import { CredentialHelper } from '@venizia/ignis-helpers';

const stored = await CredentialHelper.hash({ password: 'hunter2' });
const ok = await CredentialHelper.verify({ password: 'hunter2', hash: stored });

// keep writing bcrypt
const legacy = await CredentialHelper.hash({ password: 'hunter2', algorithm: 'bcrypt' });
```

A bcrypt hash of a password longer than 72 bytes needs care (argon2id has no such limit), because the `bcrypt` package keeps only its first 72 bytes and Bun keeps all of it:

- **Reading old hashes.** `verify` retries a bcrypt hash with the first 72 bytes, so a user whose long password was hashed by the package can still sign in. This retry is for those legacy hashes: a hash that `hash` wrote is read on the first attempt and never depends on it. The price is that a hash of a password of exactly 72 bytes also accepts that password followed by anything, the way bcrypt always has.
- **Rolling back.** A hash that `hash` writes for a password longer than 72 bytes is read by Bun only. The `bcrypt` package cannot verify it, so going back to that package, or another service reading the same column, locks those users out. Up to 72 bytes the two read each other's hashes.

`verify` returns `false` when there is nothing to match (an empty or non-string password, an empty hash). A stored value that is not a password hash throws an error with status 500, so a corrupt row is not answered like a wrong password.

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

- [`packages/helpers/src/modules/crypto/algorithms/abstract.algorithm.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/crypto/algorithms/abstract.algorithm.ts) - `AbstractCryptoAlgorithm`
- [`packages/helpers/src/modules/crypto/algorithms/base.algorithm.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/crypto/algorithms/base.algorithm.ts) - `BaseCryptoAlgorithm`
- [`packages/helpers/src/modules/crypto/algorithms/aes.algorithm.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/crypto/algorithms/aes.algorithm.ts) - `AES`
- [`packages/helpers/src/modules/crypto/algorithms/rsa.algorithm.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/crypto/algorithms/rsa.algorithm.ts) - `RSA`
- [`packages/helpers/src/modules/crypto/algorithms/ecdh.algorithm.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/crypto/algorithms/ecdh.algorithm.ts) - `ECDH`
- [`packages/helpers/src/modules/crypto/algorithms/hash.algorithm.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/crypto/algorithms/hash.algorithm.ts) - `Hash`
