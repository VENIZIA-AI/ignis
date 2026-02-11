# API Summary

| Method | Class | Returns | Description |
|--------|-------|---------|-------------|
| `AES.withAlgorithm(algorithm)` | AES | `AES` | Create AES instance with CBC or GCM mode |
| `encrypt(opts)` | AES | `string` | Encrypt a string message |
| `decrypt(opts)` | AES | `string` | Decrypt a ciphertext string |
| `encryptFile(opts)` | AES | `string` | Encrypt file contents to string |
| `decryptFile(opts)` | AES | `string` | Decrypt file contents to string |
| `RSA.withAlgorithm()` | RSA | `RSA` | Create RSA instance |
| `generateDERKeyPair(opts?)` | RSA | `{ publicKey, privateKey }` | Generate DER-format key pair |
| `encrypt(opts)` | RSA | `string` | Encrypt with public key |
| `decrypt(opts)` | RSA | `string` | Decrypt with private key |
| `ECDH.withAlgorithm(opts?)` | ECDH | `ECDH` | Create ECDH instance with optional HKDF info |
| `generateKeyPair()` | ECDH | `Promise<{ keyPair, publicKeyB64 }>` | Generate P-256 key pair |
| `importPublicKey(opts)` | ECDH | `Promise<CryptoKey>` | Import peer's base64 public key |
| `deriveAESKey(opts)` | ECDH | `Promise<{ key, salt }>` | Derive AES-256-GCM key via HKDF |
| `encrypt(opts)` | ECDH | `Promise<IECDHEncryptedPayload>` | Encrypt with derived AES key |
| `decrypt(opts)` | ECDH | `Promise<string>` | Decrypt with derived AES key |
| `hash(text, options)` | _(function)_ | `string` | MD5 or SHA256 HMAC hash |
