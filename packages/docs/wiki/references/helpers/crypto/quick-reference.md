# Quick Reference

| Class | Extends | Use Case |
|-------|---------|----------|
| **AES** | BaseCryptoAlgorithm | Fast symmetric encryption (AES-256-CBC, AES-256-GCM) |
| **RSA** | BaseCryptoAlgorithm | Public-key encryption with DER key pairs |
| **ECDH** | AbstractCryptoAlgorithm | Ephemeral key exchange with AES-256-GCM session encryption |
| **hash()** | _(standalone function)_ | MD5 and SHA256 HMAC hashing |

## Algorithm Comparison

| Feature | AES | RSA | ECDH |
|---------|-----|-----|------|
| Type | Symmetric | Asymmetric | Asymmetric + Symmetric |
| Key exchange | Shared secret | Public/private | Diffie-Hellman |
| Speed | Fast | Slow (large keys) | Fast (small keys) |
| Max message | Unlimited | ~190 bytes (2048-bit) | Unlimited |
| Async | No | No | Yes (Web Crypto) |
| Runtime | Node.js `crypto` | Node.js `crypto` | `crypto.subtle` (Bun/Browser) |

::: details Import Paths
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
:::
