---
title: Hash and the static-asset commit token need Bun, and the mail generators name bad input
description: "Hash.digest, Hash.hmac and AssetCommitToken compute with Bun.CryptoHasher, so they throw outside Bun; the mail code and token generators draw from crypto.getRandomValues and reject a bad length or size with a named error."
packages: ['@venizia/ignis-helpers', '@venizia/ignis']
---

# Changelog - 2026-11-02

## Hash and the commit token need Bun; the mail generators name bad input

<Badge type="warning" text="Behavior Change" />

**In one line.** `Hash.digest`, `Hash.hmac` and `AssetCommitToken` now run only on Bun, so check any place that calls them under Node, in a Vite config or in a browser bundle.

## What changed

- **`Hash.digest` and `Hash.hmac` compute with `Bun.CryptoHasher`.** They no longer import `node:crypto`. Algorithms (md5, sha1, sha256, sha384, sha512), output encodings (hex, base64, base64url) and the output for the same input are unchanged.
- **Outside Bun they throw `ReferenceError: Bun is not defined`.** That covers a vitest run under Node, a Vite config, a script started with `node` and a browser bundle.
- **`AssetCommitToken` signs with `Bun.CryptoHasher('sha256', secretKey)`.** It needs Bun too. A token built for the same input is identical to the one built before, so tokens already handed out still verify.
- **A `secretKey` that is not a string throws a named error.** The message is `[AssetCommitToken][sign] Invalid secretKey | Expected a string`. Without this check Bun would sign with no key and answer a plain SHA-256 that anyone can compute.
- **The mail code and token generators draw from `crypto.getRandomValues`.** This covers `NumericCodeGenerator`, `RandomTokenGenerator` and the `Message-ID` and multipart boundaries of a MIME message. No `node:crypto` import is left in them.
- **`NumericCodeGenerator.generateCode(length)` rejects a length it cannot draw.** `10 ** length` must be an integer from 1 to 281474976710656, so a length of 1 to 14 works and 15 or more throws `[NumericCodeGenerator][generateCode] Invalid length | 10 ** length must be an integer from 1 to 281474976710656 | Got: <value>`. Codes are drawn uniformly.
- **`RandomTokenGenerator.generateToken(bytes)` rejects a bad size.** A negative, fractional, `NaN` or unsafe number throws `[RandomTokenGenerator][generateToken] Invalid bytes | Expected a non-negative integer | Got: <value>`.

## Who is affected

- **Code that calls `Hash.digest`, `Hash.hmac` or the commit token outside Bun.** Move it to Bun, or use the Web Crypto `crypto.subtle.digest` there (it is async and has no md5).
- **Code or alerts that match the old error text of the mail generators or of a bad commit-token key.** The text is new, as shown above.
- **Apps that run on Bun and pass valid values.** No action needed.

## Details

```typescript
import { Hash } from '@venizia/ignis-helpers';

// Bun: unchanged
const digest = Hash.withAlgorithm('sha256').digest({ message: 'payload' });

// Node or a browser: Web Crypto, async
const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('payload'));
```
