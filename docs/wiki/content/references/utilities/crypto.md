# Crypto Utility

The Crypto utility provides a single stateless `hash` function built on Node's built-in `node:crypto` module. It covers the two most common lightweight hashing needs - MD5 digests and HMAC-SHA256 signatures - without any external dependencies.

::: tip Full AES / RSA / ECDH encryption
This page covers only the utility-level `hash` function. For full symmetric/asymmetric encryption (AES-256-CBC, AES-256-GCM, RSA, ECDH key exchange) see the [Crypto helper](/extensions/helpers/crypto/).
:::

## `hash`

Creates a hash or HMAC digest of a string and returns it as a text-encoded string.

### Signature

```typescript
hash(
  text: string,
  options: {
    algorithm: 'SHA256' | 'MD5';
    secret?: string;
    outputType: BinaryToTextEncoding; // 'hex' | 'base64' | 'base64url' | 'latin1'
  },
): string
```

**Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `text` | `string` | The input string to hash. |
| `options.algorithm` | `'SHA256' \| 'MD5'` | Hashing algorithm. |
| `options.secret` | `string` (optional) | Secret key for HMAC. Only used when `algorithm` is `'SHA256'`. |
| `options.outputType` | `BinaryToTextEncoding` | Encoding of the output string - typically `'hex'` or `'base64'`. |

### Behavior

| Algorithm | `secret` provided | Result |
|-----------|-------------------|--------|
| `'MD5'` | ignored | MD5 digest of `text` |
| `'SHA256'` | yes | HMAC-SHA256 of `text` signed with `secret` |
| `'SHA256'` | no / `undefined` | `text` returned unchanged (no-op) |
| any other | - | `text` returned unchanged (no-op) |

The SHA256 pass-through is intentional: it lets callers skip hashing conditionally (for example, when a secret is not yet configured) without adding an extra `if` at the call site. If you need an unconditional SHA256 hash without a secret, use MD5 or the full [Crypto helper](/extensions/helpers/crypto/).

### Examples

**MD5 digest (hex)**

```typescript
import { hash } from '@venizia/ignis-helpers';

const digest = hash('user@example.com', { algorithm: 'MD5', outputType: 'hex' });
// => 'b58996c504c5638798eb6b511e6f49af'
```

**MD5 digest (base64) - useful for HTTP ETags**

```typescript
const etag = hash(JSON.stringify(payload), { algorithm: 'MD5', outputType: 'base64' });
// => 'tYlsUExWOHeY62a1EW9Jr...'
```

**HMAC-SHA256 - signing a webhook payload**

```typescript
import { hash } from '@venizia/ignis-helpers';

const signature = hash(rawBody, {
  algorithm: 'SHA256',
  secret: process.env.WEBHOOK_SECRET,
  outputType: 'hex',
});

// Compare against the value in the X-Hub-Signature-256 header
const expected = `sha256=${signature}`;
```

**HMAC-SHA256 in base64 - API request signing**

```typescript
const hmac = hash(`${timestamp}.${body}`, {
  algorithm: 'SHA256',
  secret: apiKey,
  outputType: 'base64',
});
```

## When to use

Use `hash` for lightweight, one-off hashing that does not require key management or IV handling:

- Building cache keys or ETags from response bodies (MD5)
- Verifying webhook signatures (HMAC-SHA256)
- Signing API requests with a shared secret (HMAC-SHA256)
- Anonymising personally identifiable data before storing in logs (MD5)

For encryption, decryption, or asymmetric operations (AES, RSA, ECDH) use the [Crypto helper](/extensions/helpers/crypto/) instead.
