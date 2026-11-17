---
title: Hash.equals compares two digests in constant time, and Hash.verify says its text is exact
description: "Hash.equals compares two strings you already hold in constant time, Hash.verify uses it, and the verify docs say an unpadded or URL-safe form of the same base64 digest is refused."
packages: ['@venizia/ignis-helpers']
---

# Changelog - 2026-11-06

## Hash.equals compares two digests in constant time, and Hash.verify says its text is exact

<Badge type="tip" text="New Feature" /> <Badge type="danger" text="Security" />

**In one line.** `Hash.equals({ value, expected })` compares two strings you already hold, such as an idempotency fingerprint against a saved one, without the timing leak of `===`.

## What changed

- **A new static method.** `Hash.equals({ value, expected })` checks the byte length first and then compares with `crypto.timingSafeEqual`. Any difference answers `false`, and so does a value that is not a string; it never throws. Two empty strings are equal.
- **`Hash.verify` uses it.** Nothing changes for callers: `verify` still hashes `value` (or keys it with `secret`) and then compares.
- **`expected` is exact text.** The comparison is of the text, not of the bytes it stands for. Upper-case hex is not lower-case hex, and an unpadded or URL-safe form of the same base64 digest is refused. Pass the matching `outputEncoding` (`base64url`), or normalise the text first.

```typescript
const same = Hash.equals({ value: fingerprint, expected: saved.fingerprint });

const ok = Hash.withAlgorithm('sha256').verify({
  value: rawBody,
  expected: signature,
  opts: { outputEncoding: 'base64url' },
});
```

## Who is affected

- **Apps that compare two stored digests with `===`.** Switch to `Hash.equals`.
- **Everyone else.** No action needed.

## Details

| File | Package |
|------|---------|
| `src/modules/crypto/algorithms/hash.algorithm.ts` | helpers |
