---
title: A Second ID Generator, for IDs People Read
description: OpaqueUidHelper mints short, prefixed IDs from a chosen alphabet - the counterpart to SnowflakeUidHelper, which is sortable but reveals when it was minted.
---

# Changelog - 2026-08-18

## OpaqueUidHelper

<Badge type="tip" text="New Feature" />

**In one line.** `@venizia/ignis-helpers` gained a second ID generator, for IDs a person reads, types, or reads out loud.

## What changed

- **`OpaqueUidHelper` mints short IDs.** Six characters by default, from Crockford's base32 - uppercase, without `I`, `L`, `O` and `U`.
- **A prefix and a delimiter are independent toggles.** `{ enable, value }` each, so turning one off keeps its value for when you turn it back on. `INV-7K2MQ9`, `INV7K2MQ9` and `7K2MQ9` are all configurations of the same helper.
- **Four alphabets ship with it.** `CROCKFORD` (32), `BASE58` (58), `NO_VOWEL` (50, so no word can form), `BASE62` (62).
- **`nextId()` accepts an availability check.** Return `true` to accept the drawn ID, `false` to draw another. A synchronous check keeps `nextId()` returning a string; an asynchronous one makes it a promise.
- **It draws from `crypto.getRandomValues`.** That works outside a secure context, unlike `crypto.randomUUID`, so the helper runs on a plain-http origin and inside a browser Worker.

Nothing changed for `SnowflakeUidHelper`. Pick between them on one question: may this ID reveal when it was created?

| Helper | `parseId()` reads back | Pick it when |
|---|---|---|
| `SnowflakeUidHelper` | The exact millisecond, and the worker | The ID is a primary key and you want insert order for free |
| `OpaqueUidHelper` | Nothing | The ID leaves your system |

## Who is affected

- **Existing applications.** No action needed. This is additive, and `SnowflakeUidHelper` is untouched.
- **Anyone printing an ID where a customer sees it.** An invoice number built from a Snowflake ID tells the reader the millisecond you issued it. `OpaqueUidHelper` tells them nothing.

## Read this before using the default length

Six Crockford characters is 2^30 combinations - an airline record locator. It works for airlines because a locator is scoped per carrier, recycled after the trip, and regenerated on conflict. Not because 2^30 is large.

> [!WARNING]
> At six characters, a 1% chance of at least one collision arrives at roughly 4,600 IDs in one space, and 50% at roughly 38,000. This generator is probabilistic, and no length changes that.

A `prefix` partitions the space - `INV-7K2MQ9` cannot collide with `CUS-7K2MQ9` - so give each entity type its own. It does not make an ID unique inside that space. Put the column behind a unique index, and regenerate on the violation rather than checking first, which races.

See [UID](/extensions/helpers/uid/) for the full options, the alphabets, and a worked retry example.
