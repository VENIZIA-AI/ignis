---
title: Hash.verify compares a digest or signature in constant time
description: "Hash.verify checks a received digest or HMAC signature against the one a value produces, without the timing leak of ===."
packages: ['@venizia/ignis-helpers']
---

# Changelog - 2026-11-06

## Hash.verify compares a digest or signature in constant time

<Badge type="tip" text="New Feature" /> <Badge type="danger" text="Security" />

**In one line.** `Hash.verify` checks a received digest or HMAC signature (a webhook, a payment callback) against the one your value produces, and does not leak how many leading characters were right.

## What changed

- **A new method.** `Hash.withAlgorithm('sha256').verify({ value, expected, secret?, opts? })` returns `true` when `expected` is the digest of `value`, or its HMAC when `secret` is given.
- **No throw on a mismatch.** A different value, a different length or a wrong encoding answers `false`. An empty `secret` is refused, as `hmac` refuses it.
- **Same options as `digest` and `hmac`.** `opts.outputEncoding` (`hex`, `base64`, `base64url`) says how `expected` is written; the default is `hex`. The text must match exactly, so upper-case hex does not equal lower-case hex.

```typescript
const ok = Hash.withAlgorithm('sha256').verify({
  value: rawBody,
  secret: webhookSecret,
  expected: request.headers.get('x-signature') ?? '',
});
```

## Who is affected

- **Apps that compare a digest or signature with `===`.** Switch to `verify`; `===` stops at the first differing character.
- **Everyone else.** No action needed.

## Details

| File | Package |
|------|---------|
| `src/modules/crypto/algorithms/hash.algorithm.ts` | helpers |
