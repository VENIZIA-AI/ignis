---
title: Hash takes bytes and several parts
description: "Hash.digest and Hash.hmac in @venizia/ignis-helpers accept bytes as well as text, and digest hashes several parts in order as one message."
packages: ['@venizia/ignis-helpers']
---

# Changelog - 2026-11-01

## Hash takes bytes and several parts

<Badge type="tip" text="New Feature" />

**In one line.** `Hash.digest` and `Hash.hmac` now take bytes as well as text, so a binary key or a binary message needs no conversion.

## What changed

- **`hmac` takes `string | Uint8Array` for the message and for the secret.** A `Buffer` or `Uint8Array` key gives exactly the same output as the text of the same bytes, so a token already printed or stored keeps verifying.
- **`digest` takes `string | Uint8Array` for the message, or an array of them.** The parts are hashed in order as one message, for example a git blob: the header text `blob <size>` with a NUL byte, then the bytes.
- An empty secret is still refused, in any form.

## Who is affected

- **Existing callers.** No action needed: a text message and a text secret give the same output as before.
- **Code that converted a binary key to text first.** It can pass the bytes as they are.

## Details

```typescript
import { Hash, HashAlgorithms } from '@venizia/ignis-helpers';

const blobId = Hash.withAlgorithm(HashAlgorithms.SHA1).digest({
  message: [`blob ${content.length}\0`, content],
});
const token = Hash.withAlgorithm(HashAlgorithms.SHA256).hmac({ message, secret: keyBytes });
```
