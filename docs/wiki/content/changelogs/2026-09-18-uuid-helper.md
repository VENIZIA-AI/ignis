---
title: One UUID Helper, Three Versions
description: "UuidHelper is the single place to mint UUIDs: v7 for database keys, v5 for deterministic idempotency keys, v4 for public tokens."
packages: ['@venizia/ignis-helpers']
---

# Changelog - 2026-09-18

## `UuidHelper` - one door for every UUID

<Badge type="tip" text="New Feature" />

**In one line.** You can now mint a deterministic version 5 UUID, the version an idempotency key needs, and every other UUID comes from the same helper.

```typescript
import { UuidHelper, UuidNamespaces } from '@venizia/ignis-helpers/core';

const uuid = UuidHelper.getInstance();

uuid.v7(); // database primary key - time-ordered
uuid.v4(); // public identifier or token - random
uuid.v5({ namespace: UuidNamespaces.URL, name: `orders/${orderId}/refund` }); // deterministic
```

## What changed

- **`v5({ namespace, name })` is new.** The same inputs always give the same id, on every host. Derive an idempotency key from the business data instead of storing a lookup.
- **`v4()` and `v7()` live on the same helper.** Use `v7()` for database keys and `v4()` for a public identifier.
- **`inspect({ value })` reads an id back:** its version, and for a v7 the moment it was minted. `UuidHelper.isValid(value)` is the static check.
- **`UuidNamespaces`** carries the four RFC 9562 namespaces (`DNS`, `URL`, `OID`, `X500`). If none fit, mint your own with `v4()` once and pin it as a constant.
- **Works on `http://<lan-ip>` in a browser.** The helper no longer calls `crypto.randomUUID` directly, which is `undefined` outside a secure context. It falls back to `crypto.getRandomValues` and gives the same shape.

## Who is affected

- **Existing code.** No action needed. `RequestIdGenerator` now delegates to `UuidHelper.v4()`.
- **Anyone writing an idempotency key by hand.** Use `v5` instead of hashing a string yourself.

## Details

| Use | Version |
|---|---|
| Database primary key | `v7()` - time-ordered |
| Idempotency key, deterministic id | `v5({ namespace, name })` |
| Public identifier, random token | `v4()` |

> [!WARNING]
> A version 5 id is **reproducible, not secret.** Anyone holding the same namespace and name can compute it. Never use one as a share link, a reset token or an API key.

> [!TIP]
> A version 5 id gives you a **stable** key. What enforces idempotency is the unique index on the column, plus handling the conflict on insert.

A version 7 timestamp can sit a few milliseconds **ahead** of the wall clock. 4096 ids fit in one millisecond, and past that the generator borrows the next one. A creation time read from `inspect()` inside a burst leads the clock by roughly one millisecond per 4096 ids.
