---
title: One UUID Helper, Three Versions
description: "UuidHelper is the single door for UUIDs: v7 for database keys, v5 for deterministic idempotency keys, v4 for public tokens - measured faster than the uuid package on all three."
---

# Changelog - 2026-09-18

## `UuidHelper` - one door for every UUID

<Badge type="tip" text="New Feature" />

**In one line.** Every UUID IGNIS mints now comes from one helper, and it can mint a deterministic
version 5 id - the version an idempotency key needs.

```typescript
import { UuidHelper, UuidNamespaces } from '@venizia/ignis-helpers/core';

const uuid = UuidHelper.getInstance();

uuid.v7(); // database primary key - time-ordered
uuid.v4(); // public identifier or token - random
uuid.v5({ namespace: UuidNamespaces.URL, name: `orders/${orderId}/refund` }); // deterministic
```

## What changed

- **`v5({ namespace, name })` is new.** The same inputs always answer the same id, on every host,
  forever. That is what an idempotency key is: derive it from the business data instead of storing a
  lookup.
- **`v4()` and `v7()` moved behind the same helper.** `v7()` is the engine already used for string
  primary keys; `v4()` is the random one for a public identifier.
- **`inspect({ value })` reads an id back** - its version, and for a v7 the moment it was minted.
  `UuidHelper.isValid(value)` is the static check.
- **`UuidNamespaces`** carries the four RFC 9562 namespaces (`DNS`, `URL`, `OID`, `X500`). Mint your
  own with `v4()` once and pin it as a constant if none of them fit.
- **Nothing calls `crypto.randomUUID` directly any more.** Three call sites did - a WebSocket client
  id, a WebSocket server id, and the pending object name of a direct upload. Browsers expose that
  API only in a secure context, so on `http://<lan-ip>` it is `undefined` and the first call throws;
  the helper falls back to `crypto.getRandomValues` and produces the identical shape.

## Who is affected

- **Existing code.** No action needed. Nothing was renamed or removed: `UuidV7Generator` and
  `RequestIdGenerator` are still exported and still behave the same. `RequestIdGenerator` now
  delegates to `UuidHelper.v4()`.
- **Anyone writing an idempotency key by hand.** Use `v5` instead of hashing a string yourself.
- **Anyone who needs a UUID anywhere.** Reach for `UuidHelper`; pick the version by what the id is
  for, using the table below.

## Which version

| Use | Version | Why |
|---|---|---|
| Database primary key | `v7()` | Time-ordered, so a B-tree appends instead of splitting pages |
| Idempotency key, deterministic id | `v5({ namespace, name })` | Same inputs, same id - no state to store |
| Public identifier, random token | `v4()` | No clock, nothing to correlate a caller by |

Two limits worth stating plainly:

> [!WARNING]
> A version 5 id is **reproducible, not secret.** Anyone holding the same namespace and name can
> compute it. Never use one as a share link, a reset token or an API key.

> [!TIP]
> A version 5 id gives you a **stable** key. What actually enforces idempotency is the unique index
> on the column, plus handling the conflict on insert.

## Details

Measured against `uuid@14.0.2` on the same machine, median of seven alternating passes, 200,000
operations each:

| | `uuid` | IGNIS | |
|---|---|---|---|
| v4 | 36.1 ns | **32.6 ns** | 1.1x |
| v5 | 1508.8 ns | **409.8 ns** | 3.7x |
| v7 | 255.1 ns | **60.5 ns** | 4.2x |

Version 5 hashes with SHA-1, and the digest is carried in IGNIS rather than borrowed: `node:crypto`
is a Node builtin the browser-purity gate refuses, and `crypto.subtle.digest` is both asynchronous
and secure-context-gated - the same trap that rules out `crypto.randomUUID`. Keeping it inline is
what lets `v5()` be synchronous like `v4()` and `v7()`, and it runs everywhere the rest of the
kernel runs. Its output is verified against the `uuid` package and against the published RFC test
vector, and against the platform SHA-1 across boundary lengths.

A version 7 timestamp can sit a few milliseconds **ahead** of the wall clock: 4096 ids fit in one
millisecond, and past that the generator borrows the next one to keep the sequence climbing.
`inspect()` reports what the id carries, so a creation time read inside a burst leads the clock by
roughly one millisecond per 4096 ids.

**Files:** [`packages/helpers/src/modules/uid/uuid/helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/uid/uuid/helper.ts) ·
[`packages/helpers/src/modules/uid/uuid/sha1.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/uid/uuid/sha1.ts) ·
[`packages/helpers/src/modules/uid/uuid/v7.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/uid/uuid/v7.ts) ·
[`packages/helpers/src/modules/uid/request-id.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/uid/request-id.ts)
