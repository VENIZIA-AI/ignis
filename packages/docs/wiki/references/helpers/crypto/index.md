# Crypto

Cryptographic utilities for AES symmetric encryption, RSA asymmetric encryption, ECDH key exchange, and hashing.

## Quick Reference

| Class | Extends | Use Case |
|-------|---------|----------|
| **AES** | BaseCryptoAlgorithm | Fast symmetric encryption (AES-256-CBC, AES-256-GCM) |
| **RSA** | BaseCryptoAlgorithm | Public-key encryption with DER key pairs |
| **ECDH** | AbstractCryptoAlgorithm | Ephemeral key exchange with AES-256-GCM session encryption |
| **hash()** | _(standalone function)_ | MD5 and SHA256 HMAC hashing |

#### Algorithm Comparison

| Feature | AES | RSA | ECDH |
|---------|-----|-----|------|
| Type | Symmetric | Asymmetric | Asymmetric + Symmetric |
| Key exchange | Shared secret | Public/private | Diffie-Hellman |
| Speed | Fast | Slow (large keys) | Fast (small keys) |
| Max message | Unlimited | ~190 bytes (2048-bit) | Unlimited |
| Async | No | No | Yes (Web Crypto) |
| Runtime | Node.js `crypto` | Node.js `crypto` | `crypto.subtle` (Bun/Browser) |

#### Import Paths

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

#### Type Hierarchy

All crypto algorithms share a common type hierarchy with 7 generic type parameters:

```
ICryptoAlgorithm (interface)
  └── AbstractCryptoAlgorithm (extends BaseHelper)
        ├── BaseCryptoAlgorithm (adds normalizeSecretKey, getAlgorithmKeySize)
        │     ├── AES
        │     └── RSA
        └── ECDH (uses CryptoKey objects, not string secrets)
```

**Why two base classes?**
- `BaseCryptoAlgorithm` adds `normalizeSecretKey()` and `getAlgorithmKeySize()` -- useful for AES/RSA which use string secrets with size normalization
- `ECDH` extends `AbstractCryptoAlgorithm` directly because it uses `CryptoKey` objects (Web Crypto), not string secrets

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

## Creating an Instance

All crypto algorithm classes extend `BaseHelper` (via `AbstractCryptoAlgorithm`), providing scoped logging. Each class uses a static `withAlgorithm()` factory method.

```typescript
import { AES, RSA, ECDH } from '@venizia/ignis-helpers';

// AES -- choose CBC or GCM mode
const aesCbc = AES.withAlgorithm('aes-256-cbc');
const aesGcm = AES.withAlgorithm('aes-256-gcm');

// RSA -- single algorithm, no parameters
const rsa = RSA.withAlgorithm();

// ECDH -- optional HKDF info for key isolation
const ecdh = ECDH.withAlgorithm();
const ecdhCustom = ECDH.withAlgorithm({
  algorithm: 'ecdh-p256',
  hkdfInfo: 'my-app-session-keys',
});
```

#### AES Constructor Options

| Algorithm | Mode | Features |
|-----------|------|----------|
| `aes-256-cbc` | CBC | Standard block cipher, widely compatible |
| `aes-256-gcm` | GCM | Authenticated encryption -- detects tampering |

#### ECDH Constructor Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `algorithm` | `'ecdh-p256'` | `'ecdh-p256'` | Curve algorithm |
| `hkdfInfo` | `string` | `'ignis-ecdh-p256-aes-256-gcm-v1'` | HKDF info string for key derivation isolation |

Different `hkdfInfo` values produce **incompatible keys** from the same ECDH shared secret. Use this to isolate key derivation between different application contexts.

## Usage

### AES Encryption

The `AES` class provides encryption and decryption using the Advanced Encryption Standard with 256-bit keys.

```typescript
const aes = AES.withAlgorithm('aes-256-gcm');
const secret = 'my-application-secret-key';

// Encrypt
const encrypted = aes.encrypt({ message: 'This is a secret message.', secret });
// => base64 encoded string containing IV + ciphertext

// Decrypt
const decrypted = aes.decrypt({ message: encrypted, secret });
// => 'This is a secret message.'
```

> [!TIP]
> Prefer `aes-256-gcm` for new applications. It provides **authenticated encryption** -- if the ciphertext is tampered with, decryption will throw an error rather than silently returning corrupted data. This does not happen with CBC mode.

#### AES Extra Options

```typescript
import C from 'node:crypto';

const encrypted = aes.encrypt({
  message: 'hello',
  secret: 'my-secret',
  opts: {
    iv: C.randomBytes(16),          // Custom IV (default: random 16 bytes)
    inputEncoding: 'utf-8',          // Message input encoding (default: 'utf-8')
    outputEncoding: 'hex',           // Ciphertext output encoding (default: 'base64')
    doThrow: false,                  // Return original message on error (default: true)
  },
});
```

| Option | Type | Default (encrypt) | Default (decrypt) | Description |
|--------|------|-------------------|-------------------|-------------|
| `iv` | `Buffer` | `crypto.randomBytes(16)` | Extracted from ciphertext | Initialization vector |
| `inputEncoding` | `crypto.Encoding` | `'utf-8'` | `'base64'` | Encoding of the input message |
| `outputEncoding` | `crypto.Encoding` | `'base64'` | `'utf-8'` | Encoding of the output |
| `doThrow` | `boolean` | `true` | `true` | If `false`, returns the original message on error instead of throwing |

#### File Encryption

```typescript
// Encrypt file contents -> returns encrypted string
const encrypted = aes.encryptFile({
  absolutePath: '/path/to/config.json',
  secret: 'my-secret',
});

// Decrypt file contents -> returns decrypted string
const decrypted = aes.decryptFile({
  absolutePath: '/path/to/config.json.enc',
  secret: 'my-secret',
});
```

Both methods read the file synchronously via `fs.readFileSync`, convert to UTF-8, then encrypt/decrypt as a string. If `absolutePath` is empty or falsy, they return an empty string.

### RSA Encryption

The `RSA` class provides public-key encryption using RSA with DER-formatted keys.

#### Generating a Key Pair

Keys are generated in DER format (binary, compact).

```typescript
const rsa = RSA.withAlgorithm();

// Default: 2048-bit modulus
const { publicKey, privateKey } = rsa.generateDERKeyPair();

// Custom modulus length
const keys = rsa.generateDERKeyPair({ modulus: 4096 });
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `modulus` | `number` | `2048` | RSA modulus length in bits |

The returned `publicKey` is a `Buffer` in SPKI/DER format and `privateKey` is a `Buffer` in PKCS8/DER format.

#### Encrypting and Decrypting

```typescript
// Encrypt using the public key (base64-encoded DER)
const pubKeyB64 = publicKey.toString('base64');
const encrypted = rsa.encrypt({ message: 'secret data', secret: pubKeyB64 });

// Decrypt using the private key (base64-encoded DER)
const privKeyB64 = privateKey.toString('base64');
const decrypted = rsa.decrypt({ message: encrypted, secret: privKeyB64 });
// => 'secret data'
```

#### RSA Extra Options

```typescript
const encrypted = rsa.encrypt({
  message: 'hello',
  secret: pubKeyB64,
  opts: {
    inputEncoding: {
      key: 'base64',       // Key encoding (default: 'base64')
      message: 'utf-8',    // Message encoding (default: 'utf-8')
    },
    outputEncoding: 'hex',  // Ciphertext output (default: 'base64')
    doThrow: false,         // Return original on error (default: true)
  },
});
```

| Option | Type | Default (encrypt) | Default (decrypt) | Description |
|--------|------|-------------------|-------------------|-------------|
| `inputEncoding.key` | `crypto.Encoding` | `'base64'` | `'base64'` | Encoding of the key buffer |
| `inputEncoding.message` | `crypto.Encoding` | `'utf-8'` | `'base64'` | Encoding of the input message |
| `outputEncoding` | `crypto.Encoding` | `'base64'` | `'utf-8'` | Encoding of the output |
| `doThrow` | `boolean` | `true` | `true` | If `false`, returns the original message on error instead of throwing |

#### Error Handling

```typescript
// Default: throws on invalid key
try {
  rsa.encrypt({ message: 'test', secret: 'invalid-key' });
} catch (error) {
  // Handle encryption error
}

// Graceful: return original message on error
const result = rsa.encrypt({
  message: 'test',
  secret: 'invalid-key',
  opts: { doThrow: false },
});
// result === 'test' (original message returned)
```

### ECDH Key Exchange

The `ECDH` class provides **ephemeral key exchange** using ECDH P-256 with HKDF-derived AES-256-GCM session encryption. It uses the Web Crypto API (`crypto.subtle`) and is fully async.

#### When to Use ECDH

| Scenario | Use ECDH | Use AES/RSA |
|----------|----------|-------------|
| Two parties need a shared secret without pre-sharing | Yes | No |
| WebSocket session encryption | Yes | No |
| Encrypting data at rest | No | AES |
| Signing/verifying tokens | No | RSA |
| Forward secrecy needed | Yes | No |

#### Complete Key Exchange Flow

```typescript
const ecdh = ECDH.withAlgorithm();

// 1. Both parties generate key pairs
const alice = await ecdh.generateKeyPair();
const bob = await ecdh.generateKeyPair();

// 2. Exchange public keys (over any channel -- they're safe to share)
const alicePubForBob = await ecdh.importPublicKey({ rawKeyB64: alice.publicKeyB64 });
const bobPubForAlice = await ecdh.importPublicKey({ rawKeyB64: bob.publicKeyB64 });

// 3. Initiator derives AES key (generates a random salt)
const { key: aliceKey, salt } = await ecdh.deriveAESKey({
  privateKey: alice.keyPair.privateKey,
  peerPublicKey: bobPubForAlice,
});

// 4. Responder derives the SAME AES key using the initiator's salt
const { key: bobKey } = await ecdh.deriveAESKey({
  privateKey: bob.keyPair.privateKey,
  peerPublicKey: alicePubForBob,
  salt,  // Must use the same salt for keys to match
});

// 5. Alice encrypts -> Bob decrypts (or vice versa)
const encrypted = await ecdh.encrypt({ message: 'Hello Bob!', secret: aliceKey });
const decrypted = await ecdh.decrypt({ message: encrypted, secret: bobKey });
// => 'Hello Bob!'
```

> [!IMPORTANT]
> Both parties **must** use the same salt for `deriveAESKey` to produce matching keys. The initiator omits the `salt` parameter (a random 32-byte salt is generated), then shares the returned `salt` string with the responder.

#### Key Generation and Import

```typescript
// Generate a key pair
const { keyPair, publicKeyB64 } = await ecdh.generateKeyPair();
// keyPair.publicKey  -- CryptoKey (exported as raw base64 via publicKeyB64)
// keyPair.privateKey -- CryptoKey (non-extractable)
// publicKeyB64       -- base64 encoded raw public key (65 bytes for P-256)

// Import a peer's base64-encoded public key
const peerKey = await ecdh.importPublicKey({ rawKeyB64: peerPublicKeyB64 });
```

#### AES Key Derivation

The derived key uses **HKDF** (HMAC-based Key Derivation Function) with SHA-256 to produce an AES-256-GCM key from the ECDH shared secret. A random 32-byte salt is generated if not provided.

```typescript
// Initiator: omit salt (random salt is generated)
const { key: aesKey, salt } = await ecdh.deriveAESKey({
  privateKey: myKeyPair.privateKey,
  peerPublicKey: importedPeerPublicKey,
});
// aesKey -- CryptoKey for AES-256-GCM (non-extractable, encrypt + decrypt)
// salt   -- base64 encoded 32-byte salt (share with peer)

// Responder: provide the initiator's salt
const { key: peerAesKey } = await ecdh.deriveAESKey({
  privateKey: peerKeyPair.privateKey,
  peerPublicKey: importedMyPublicKey,
  salt,  // Same salt -> same derived key
});
```

#### `deriveAESKey` Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `privateKey` | `CryptoKey` | -- | Your ECDH private key from `generateKeyPair()` |
| `peerPublicKey` | `CryptoKey` | -- | Peer's public key from `importPublicKey()` |
| `salt` | `string` | Random 32 bytes | Base64-encoded salt for HKDF. Omit to generate a new random salt. |

#### Additional Authenticated Data (AAD)

ECDH encrypt/decrypt supports **Additional Authenticated Data** via the `opts.additionalData` parameter. AAD is authenticated but not encrypted -- it binds the ciphertext to a context (e.g., channel ID, session ID) so the same ciphertext cannot be replayed in a different context.

```typescript
// Encrypt with AAD
const encrypted = await ecdh.encrypt({
  message: 'context-bound message',
  secret: sharedKey,
  opts: { additionalData: 'channel-123' },
});

// Decrypt must provide the SAME AAD
const decrypted = await ecdh.decrypt({
  message: encrypted,
  secret: sharedKey,
  opts: { additionalData: 'channel-123' },
});

// Decrypt with wrong/missing AAD throws
await ecdh.decrypt({ message: encrypted, secret: sharedKey });
// => throws (AAD mismatch)
```

#### Encrypted Payload Format

```typescript
interface IECDHEncryptedPayload {
  iv: string;  // base64 encoded 12-byte IV
  ct: string;  // base64 encoded ciphertext + GCM auth tag (128-bit)
}
```

#### Security Properties

| Property | Guarantee |
|----------|-----------|
| **Confidentiality** | AES-256-GCM encryption |
| **Integrity** | GCM authentication tag -- tampered ciphertext is detected |
| **Forward secrecy** | Ephemeral key pairs -- compromising one session doesn't compromise others |
| **Key isolation** | HKDF info parameter separates key derivation contexts |
| **Context binding** | AAD (`additionalData`) prevents cross-context replay |

### Hashing

Standalone `hash` utility function for creating hashes (e.g., for data integrity checks or HMAC signatures).

```typescript
import { hash } from '@venizia/ignis-helpers';

// MD5 Hash
const md5Hash = hash('some text', { algorithm: 'MD5', outputType: 'hex' });

// SHA256 HMAC (secret is required for SHA256)
const sha256Hash = hash('some text', {
  algorithm: 'SHA256',
  secret: 'a-secret-key',
  outputType: 'hex',
});
```

> [!WARNING]
> `SHA256` mode uses HMAC and **requires** the `secret` parameter. If `secret` is omitted, the function returns the original text unchanged (no hash is computed). `MD5` mode does not use a secret.

#### `hash` Function Signature

```typescript
function hash(
  text: string,
  options: {
    algorithm: 'SHA256' | 'MD5';
    secret?: string;
    outputType: C.BinaryToTextEncoding;  // 'hex' | 'base64' | 'base64url'
  },
): string;
```

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `algorithm` | `'SHA256' \| 'MD5'` | Yes | Hashing algorithm to use |
| `secret` | `string` | Only for SHA256 | HMAC secret key. Required for SHA256, ignored for MD5. |
| `outputType` | `'hex' \| 'base64' \| 'base64url'` | Yes | Output encoding of the hash digest |

## API Summary

| Method | Class | Returns | Description |
|--------|-------|---------|-------------|
| `AES.withAlgorithm(algorithm)` | AES | `AES` | Create AES instance with CBC or GCM mode |
| `encrypt(opts)` | AES | `string` | Encrypt a string message |
| `decrypt(opts)` | AES | `string` | Decrypt a ciphertext string |
| `encryptFile(opts)` | AES | `string` | Encrypt file contents to string |
| `decryptFile(opts)` | AES | `string` | Decrypt file contents to string |
| `RSA.withAlgorithm()` | RSA | `RSA` | Create RSA instance |
| `generateDERKeyPair(opts?)` | RSA | `{ publicKey: Buffer, privateKey: Buffer }` | Generate DER-format key pair |
| `encrypt(opts)` | RSA | `string` | Encrypt with public key |
| `decrypt(opts)` | RSA | `string` | Decrypt with private key |
| `ECDH.withAlgorithm(opts?)` | ECDH | `ECDH` | Create ECDH instance with optional HKDF info |
| `generateKeyPair()` | ECDH | `Promise<{ keyPair: CryptoKeyPair, publicKeyB64: string }>` | Generate P-256 key pair |
| `importPublicKey(opts)` | ECDH | `Promise<CryptoKey>` | Import peer's base64 public key |
| `deriveAESKey(opts)` | ECDH | `Promise<{ key: CryptoKey, salt: string }>` | Derive AES-256-GCM key via HKDF |
| `encrypt(opts)` | ECDH | `Promise<IECDHEncryptedPayload>` | Encrypt with derived AES key |
| `decrypt(opts)` | ECDH | `Promise<string>` | Decrypt with derived AES key |
| `hash(text, options)` | _(function)_ | `string` | MD5 or SHA256 HMAC hash |

## Troubleshooting

### "[validateAlgorithmName] Invalid algorithm name | algorithm: undefined"

**Cause:** An empty or undefined `algorithm` string was passed to the constructor (or `withAlgorithm()`).

**Fix:** Provide a valid algorithm name:

```typescript
const aes = AES.withAlgorithm('aes-256-gcm');   // Not undefined or empty
const rsa = RSA.withAlgorithm();                  // No parameter needed
const ecdh = ECDH.withAlgorithm();                // No parameter needed
```

### "[ECDH.fromBase64] Invalid base64 input"

**Cause:** A value passed to an ECDH method (public key, salt, or encrypted payload) is not valid base64. The string must have a length divisible by 4 and contain only characters `A-Za-z0-9+/=`.

**Fix:** Ensure all base64 strings are passed as-is from the methods that produced them (`publicKeyB64`, `salt`, `iv`, `ct`). Do not trim, re-encode, or modify these values.

### "Unsupported state or unable to authenticate data"

**Cause:** The ciphertext or auth tag was modified in transit, or you are decrypting GCM ciphertext with a CBC instance (or vice versa). CBC and GCM produce incompatible ciphertext formats.

**Fix:** Ensure the same algorithm mode is used for both encrypt and decrypt:

```typescript
// Both must use the same mode
const aes = AES.withAlgorithm('aes-256-gcm');
const encrypted = aes.encrypt({ message, secret });
const decrypted = aes.decrypt({ message: encrypted, secret }); // same instance or same mode
```

### ECDH decrypt throws even though both sides used each other's public keys

**Cause:** Each call to `deriveAESKey` without a `salt` parameter generates a new random 32-byte salt. If both sides generate their own salt, they derive different AES keys.

**Fix:** The initiator calls `deriveAESKey` without `salt` (generates one), then sends the returned `salt` string to the responder. The responder passes that `salt` into their `deriveAESKey` call.

```typescript
// Initiator
const { key: aliceKey, salt } = await ecdh.deriveAESKey({
  privateKey: alice.keyPair.privateKey,
  peerPublicKey: bobPub,
});
// Send `salt` to responder

// Responder
const { key: bobKey } = await ecdh.deriveAESKey({
  privateKey: bob.keyPair.privateKey,
  peerPublicKey: alicePub,
  salt, // <-- use initiator's salt
});
```

### SHA256 hash returns the original text instead of a hash

**Cause:** The `SHA256` algorithm uses `createHmac` internally, which requires a `secret` parameter. When `secret` is `undefined`, the function short-circuits and returns the original text.

**Fix:** Always provide a `secret` when using `SHA256`:

```typescript
const hashed = hash('text', {
  algorithm: 'SHA256',
  secret: 'my-hmac-key',
  outputType: 'hex',
});
```

## See Also

- **Related Concepts:**
  - [Services](/guides/core-concepts/services) -- Password hashing in user services

- **Other Helpers:**
  - [Helpers Index](../index) -- All available helpers

- **References:**
  - [Crypto Utility](/references/utilities/crypto) -- Pure crypto utilities
  - [Authentication Component](/references/components/authentication/) -- JWT and password verification

- **Best Practices:**
  - [Security Guidelines](/best-practices/security-guidelines) -- Cryptographic best practices
