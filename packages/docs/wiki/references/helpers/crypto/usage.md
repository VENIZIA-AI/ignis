# Usage

## AES Encryption

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

### File Encryption

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

::: details AES extra options
```typescript
import C from 'node:crypto';

const encrypted = aes.encrypt({
  message: 'hello',
  secret: 'my-secret',
  opts: {
    iv: C.randomBytes(16),          // Custom IV (default: random)
    inputEncoding: 'utf-8',          // Message input encoding (default: 'utf-8')
    outputEncoding: 'hex',           // Ciphertext output encoding (default: 'base64')
    doThrow: false,                  // Return original message on error (default: true)
  },
});
```
:::

## RSA Encryption

The `RSA` class provides public-key encryption using RSA with DER-formatted keys.

### Generating a Key Pair

Keys are generated in DER format (binary, compact).

```typescript
const rsa = RSA.withAlgorithm();

// Default: 2048-bit modulus
const { publicKey, privateKey } = rsa.generateDERKeyPair();

// Custom modulus length
const keys = rsa.generateDERKeyPair({ modulus: 4096 });
```

### Encrypting and Decrypting

```typescript
// Encrypt using the public key (base64-encoded DER)
const pubKeyB64 = publicKey.toString('base64');
const encrypted = rsa.encrypt({ message: 'secret data', secret: pubKeyB64 });

// Decrypt using the private key (base64-encoded DER)
const privKeyB64 = privateKey.toString('base64');
const decrypted = rsa.decrypt({ message: encrypted, secret: privKeyB64 });
// => 'secret data'
```

### Error Handling

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

::: details RSA extra options
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
:::

## ECDH Key Exchange

The `ECDH` class provides **ephemeral key exchange** using ECDH P-256 with HKDF-derived AES-256-GCM session encryption. It uses the Web Crypto API (`crypto.subtle`) and is fully async.

### When to Use ECDH

| Scenario | Use ECDH | Use AES/RSA |
|----------|----------|-------------|
| Two parties need a shared secret without pre-sharing | Yes | No |
| WebSocket session encryption | Yes | No |
| Encrypting data at rest | No | AES |
| Signing/verifying tokens | No | RSA |
| Forward secrecy needed | Yes | No |

### Complete Key Exchange Flow

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

### Key Generation and Import

```typescript
// Generate a key pair
const { keyPair, publicKeyB64 } = await ecdh.generateKeyPair();
// keyPair.publicKey  — CryptoKey (exported as raw base64 via publicKeyB64)
// keyPair.privateKey — CryptoKey (non-extractable)
// publicKeyB64       — base64 encoded raw public key (65 bytes for P-256)

// Import a peer's base64-encoded public key
const peerKey = await ecdh.importPublicKey({ rawKeyB64: peerPublicKeyB64 });
```

### AES Key Derivation

The derived key uses **HKDF** (HMAC-based Key Derivation Function) with SHA-256 to produce an AES-256-GCM key from the ECDH shared secret. A random 32-byte salt is generated if not provided.

```typescript
// Initiator: omit salt (random salt is generated)
const { key: aesKey, salt } = await ecdh.deriveAESKey({
  privateKey: myKeyPair.privateKey,
  peerPublicKey: importedPeerPublicKey,
});
// aesKey — CryptoKey for AES-256-GCM (non-extractable, encrypt + decrypt)
// salt   — base64 encoded 32-byte salt (share with peer)

// Responder: provide the initiator's salt
const { key: peerAesKey } = await ecdh.deriveAESKey({
  privateKey: peerKeyPair.privateKey,
  peerPublicKey: importedMyPublicKey,
  salt,  // Same salt -> same derived key
});
```

### Additional Authenticated Data (AAD)

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

### Encrypted Payload Format

```typescript
interface IECDHEncryptedPayload {
  iv: string;  // base64 encoded 12-byte IV
  ct: string;  // base64 encoded ciphertext + GCM auth tag
}
```

### Security Properties

| Property | Guarantee |
|----------|-----------|
| **Confidentiality** | AES-256-GCM encryption |
| **Integrity** | GCM authentication tag -- tampered ciphertext is detected |
| **Forward secrecy** | Ephemeral key pairs -- compromising one session doesn't compromise others |
| **Key isolation** | HKDF info parameter separates key derivation contexts |
| **Context binding** | AAD (`additionalData`) prevents cross-context replay |

## Hashing

Standalone `hash` utility function for creating hashes (e.g., for passwords or data integrity checks).

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

::: details hash function signature
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
:::
