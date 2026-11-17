---
title: TokenUidHelper and NumericUidHelper generate secret tokens and numeric codes, and mail tokens under 16 bytes are refused
description: "Two new uid helpers cover secret tokens and typed codes. Mail, MIME ids, getUID() and the upload filename now draw from them, and a verification token under 16 bytes now throws."
packages: ['@venizia/ignis-helpers', '@venizia/ignis']
---

# Changelog - 2026-11-10

## TokenUidHelper and NumericUidHelper generate secret tokens and numeric codes, and mail tokens under 16 bytes are refused

<Badge type="tip" text="New Feature" /> <Badge type="danger" text="Security" /> <Badge type="warning" text="Breaking" />

**In one line.** `TokenUidHelper` makes secret tokens (verification links, API keys, sessions, password resets) and `NumericUidHelper` makes zero-padded codes people type. Every place that built randomness by hand now uses them, and none of those places uses `Math.random` any more. A mail `tokenBytes` below 16 now throws.

## What changed

- **`TokenUidHelper`.** `new TokenUidHelper({ bytes, encoding, prefix, delimiter, checksum }).nextId()`. `bytes` is the entropy: default 32, minimum 16. Encodings are `base62` (default, 32 bytes is 43 characters), `hex` and `base64url`. A `prefix` and a `delimiter` work as in `OpaqueUidHelper`.
- **Optional checksum.** `checksum: true` appends a CRC-32 of the body (6 base62 or 8 hex characters). `isWellFormed({ key: token })` then rejects a mistyped token without a database lookup. It is a format check, not authentication: still look the token up by its hash and compare in constant time.
- **`NumericUidHelper`.** `new NumericUidHelper({ length }).nextId()` returns a uniformly random, zero-padded code. Default 6 digits, 14 at most.
- **Call sites moved onto them.** The mail verification token and code generators, the MIME `Message-ID` and multipart boundary, `ParseUtility.getUID()` and the spooled upload filename. `getUID()` is now ten uppercase base36 characters. The upload filename is `<timestamp>-<32 hex characters>-<name>`.
- **`OpaqueUidHelper` is unchanged for callers.** It now draws through the same internal source.

## Who is affected

- **Apps that set a mail `tokenBytes` below 16.** Verification-token generation now throws. Raise it to at least 16. The docs and the usual config use 32, so those need no change.
- **Everyone else.** No action needed. The mail token format (base64url, no prefix) is unchanged. The multipart boundary is now 32 hex characters instead of 24, and the upload filename's random part is longer.

## Breaking changes

> [!WARNING]
> A verification token of fewer than 16 bytes (128 bits) can be guessed offline, so `RandomTokenGenerator` now refuses it.

**Before:**

```typescript
{ codeLength: 6, tokenBytes: 8, codeExpiryMinutes: 10, tokenExpiryHours: 24 }
```

**After:**

```typescript
{ codeLength: 6, tokenBytes: 32, codeExpiryMinutes: 10, tokenExpiryHours: 24 }
```

## Details

```typescript
import { NumericUidHelper, TokenUidHelper } from '@venizia/ignis-helpers/core';

const apiKeys = new TokenUidHelper({
  prefix: { enable: true, value: 'sk' },
  delimiter: { enable: true },
  checksum: true,
});

apiKeys.nextId(); // "sk_D4NQkNXTZSa4pqKWK6zcx98xdxYYzuzowbxRQLU3nQe1NilbF"
new NumericUidHelper().nextId(); // "627100"
```

See [UID](/extensions/helpers/uid/) for the options, the encodings and when to turn the checksum on.
