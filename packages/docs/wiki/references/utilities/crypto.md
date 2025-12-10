# Crypto Utility

The Crypto utility provides simple, stateless functions for cryptographic hashing.

## `hash`

The `hash` function allows you to create a hash of a string using either `SHA256` (with a secret for HMAC) or `MD5`.

### `hash(text, options)`

-   `text` (string): The input string to hash.
-   `options` (object):
    -   `algorithm` ('SHA256' | 'MD5'): The hashing algorithm to use.
    -   `secret` (string, optional): The secret key for HMAC-SHA256.
    -   `outputType` (BinaryToTextEncoding): The output encoding (e.g., 'hex', 'base64').

### Examples

**MD5 Hash**

```typescript
import { hash } from '@venizia/ignis';

const md5Hash = hash('some text', { algorithm: 'MD5', outputType: 'hex' });
// => '552e21cd4cd99186789c2370c7482837'
```

**SHA256 HMAC**

```typescript
import { hash } from '@venizia/ignis';

const sha256Hash = hash('some text', {
  algorithm: 'SHA256',
  secret: 'a-secret-key',
  outputType: 'hex',
});
// => 'b8a1c3f2... (64-character hex string)'
```
