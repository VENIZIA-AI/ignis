# Crypto Helper

The Crypto helper in Ignis provides a suite of utilities for common cryptographic operations, including symmetric encryption (AES) and asymmetric encryption (RSA).

## AES (Symmetric Encryption)

The `AES` class provides an interface for encrypting and decrypting data using the Advanced Encryption Standard.

### Creating an AES Instance

You can create an `AES` instance by specifying the algorithm (`aes-256-cbc` or `aes-256-gcm`).

```typescript
import { AES } from '@vez/ignis';

const aes = AES.withAlgorithm('aes-256-cbc');
```

### Encrypting Data

The `encrypt` method takes a message and a secret key.

```typescript
const secret = 'a-32-byte-long-secret-key-for-aes';
const message = 'This is a secret message.';

const encryptedMessage = aes.encrypt(message, secret);
// => Returns a base64 encoded string containing the IV and encrypted data
```

### Decrypting Data

The `decrypt` method takes the encrypted message and the same secret key.

```typescript
const decryptedMessage = aes.decrypt(encryptedMessage, secret);
// => 'This is a secret message.'
```

## RSA (Asymmetric Encryption)

The `RSA` class provides an interface for encrypting and decrypting data using the RSA algorithm.

### Creating an RSA Instance

```typescript
import { RSA } from '@vez/ignis';

const rsa = RSA.withAlgorithm();
```

### Generating a Key Pair

The `generateDERKeyPair` method creates a new public/private key pair in DER format.

```typescript
const { publicKey, privateKey } = rsa.generateDERKeyPair();
```

### Encrypting Data

Encrypt data using the public key.

```typescript
const message = 'This is another secret.';
const encrypted = rsa.encrypt(message, publicKey.toString('base64'));
```

### Decrypting Data

Decrypt data using the private key.

```typescript
const decrypted = rsa.decrypt(encrypted, privateKey.toString('base64'));
// => 'This is another secret.'
```

## Hash Utility

In addition to the `Crypto` helper, Ignis also provides a standalone `hash` utility function for creating hashes (e.g., for passwords or data integrity checks).

```typescript
import { hash } from '@vez/ignis';

// MD5 Hash
const md5Hash = hash('some text', { algorithm: 'MD5', outputType: 'hex' });

// SHA256 HMAC
const sha256Hash = hash('some text', {
  algorithm: 'SHA256',
  secret: 'a-secret-key',
  outputType: 'hex',
});
```
