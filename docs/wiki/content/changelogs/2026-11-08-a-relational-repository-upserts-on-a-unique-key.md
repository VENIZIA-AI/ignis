---
title: A relational repository upserts on a declared unique key
description: "repository.upsert({ data, on }) inserts a row or updates the row holding its unique key, in one INSERT ... ON CONFLICT statement, with the same access rules as create and update."
packages: ['@venizia/ignis-connectors']
---

# Changelog - 2026-11-08

## A relational repository upserts on a declared unique key

<Badge type="tip" text="New Feature" />

**In one line.** `repository.upsert({ data, on })` writes a row whether or not it exists yet, in one statement, on Postgres, PGlite and SQLite, without giving up the row scope.

## What changed

- **`UniqueKeys.of({ table, index })`** in `@venizia/ignis-connectors/relational`. It returns a typed handle on a unique index, unique constraint or `.unique()` column of the table. It throws when the module loads if the name is missing, the index is not unique, or an entry is an expression. A partial index keeps its `where`; write it with literals, not a bound value, which SQLite cannot match.
- **`upsert({ data, on?, update?, options? })`** on every relational repository. `on` is a handle from `UniqueKeys.of`; omitted, the primary key. `update` names the columns refreshed when the row exists; by default, every column `data` sets except the key's and the primary key; a primary key column in `update` is refused. It returns `{ count, data }` like `create`.
- **Checked by the compiler.** A key of another table, an unknown `update` column, `createdAt`/`createdBy` in `update`, and `data` missing a required column do not compile.
- **The rules of `create` and `update` hold.** The new row passes the write guard as a create (`assign` fills the scope column), the updated columns pass it as an update, and the existing row must be in your scope and default filter. A row outside them is left as it is and the call fails with the write-denied 403.
- **A null in a key column is refused (400),** unless the key is a `nullsNotDistinct()` constraint: a null never conflicts, so the upsert would insert a duplicate each time.
- **Defaults** apply on insert, `$onUpdate` columns such as `modifiedAt` on the update branch; hidden fields are written and never returned.

```ts
export class SelfOrderCache extends ModelFactory.defineEntity({ table: selfOrderCacheTable }) {
  static readonly keys = {
    merchantCacheKey: UniqueKeys.of({ table: selfOrderCacheTable, index: 'self_order_cache_merchant_key' }),
  };
}

await cache.upsert({ data: { cacheKey, value, expiresAt }, on: SelfOrderCache.keys.merchantCacheKey });
```

## Who is affected

- **Code that reads a row, then creates or updates it.** It can use `upsert`: one statement, no race between the read and the write. Optional.
- **Everyone else.** No action needed.

See [Upsert](/guides/core-concepts/persistent/repositories#upsert) and [Unique Keys](/guides/core-concepts/persistent/models#unique-keys).
