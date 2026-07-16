---
title: Crypto Utility
description: Stateless MD5 and HMAC-SHA256 hashing built on node:crypto
difficulty: beginner
lastUpdated: 2026-07-16
---

# Crypto Utility

A single stateless `hash` function for lightweight MD5 digests and HMAC-SHA256 signatures, with no external dependencies beyond Node's built-in `node:crypto`.

## In one example

```typescript
import { hash } from '@venizia/ignis-helpers';

const digest = hash('user@example.com', { algorithm: 'MD5', outputType: 'hex' });
// => 'b58996c504c5638798eb6b511e6f49af'

const signature = hash(rawBody, {
  algorithm: 'SHA256',
  secret: process.env.WEBHOOK_SECRET,
  outputType: 'hex',
});
// Compare against the X-Hub-Signature-256 header: `sha256=${signature}`
```

## Functions

| Function | Signature | What it does |
|----------|-----------|---------------|
| `hash` | `hash(text: string, options: { algorithm: 'SHA256' \| 'MD5'; secret?: string; outputType: BinaryToTextEncoding }): string` | Creates an MD5 digest or an HMAC-SHA256 signature of `text`, encoded via `outputType` (`'hex'`, `'base64'`, `'base64url'`, `'latin1'`). |

## Behavior

| Algorithm | `secret` provided | Result |
|-----------|-------------------|--------|
| `'MD5'` | ignored | MD5 digest of `text` |
| `'SHA256'` | yes | HMAC-SHA256 of `text` signed with `secret` |
| `'SHA256'` | no / `undefined` | `text` returned unchanged (no-op) |
| any other value | - | `text` returned unchanged (no-op) |

## Notes

- **The SHA256 pass-through is intentional.** It lets callers skip hashing conditionally (for example, when a secret is not yet configured) without an extra `if` at the call site.
- **Need an unconditional SHA256 hash with no secret?** Use `'MD5'`, or reach for the full [Crypto helper](/extensions/helpers/crypto/).
- **Typical uses:** cache keys or ETags from response bodies (MD5), webhook signature verification (HMAC-SHA256), API request signing (HMAC-SHA256), anonymising PII before logging (MD5).
- **Out of scope:** encryption, decryption, and asymmetric operations (AES, RSA, ECDH) - see the [Crypto helper](/extensions/helpers/crypto/) instead.

## See also

- [Crypto helper](/extensions/helpers/crypto/) - full AES / RSA / ECDH encryption
- [Utilities Overview](/references/utilities/) - all utility functions

**Files:**

- [`packages/helpers/src/utilities/crypto.utility.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/utilities/crypto.utility.ts)
