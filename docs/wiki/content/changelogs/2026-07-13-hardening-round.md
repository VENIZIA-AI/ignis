---
title: Security and Reliability Hardening - SQL Injection, Filter Scope, and 11 More Fixes
description: A SQL injection in array filters and two ways to bypass a default filter are closed, hidden fields no longer leak from search results, and several errors, logging, upload and boot bugs are fixed.
packages: ['@venizia/ignis', '@venizia/ignis-boot', '@venizia/ignis-helpers', '@venizia/ignis-inversion']
---

# Changelog - 2026-07-13

## Security and Reliability Hardening

<Badge type="danger" text="Security" /> <Badge type="warning" text="Breaking Change" /> <Badge type="info" text="Bug Fix" /> <Badge type="tip" text="Enhancement" />

**In one line.** A live SQL injection and two default-filter bypasses are closed, and ten other bugs across search, logging, uploads and boot are fixed. Two fixes change existing behavior.

## What changed

Security:

- **SQL injection through array filters.** The `overlaps` and `contains` operators concatenated filter values into raw SQL, so a crafted array value could run arbitrary SQL. Values are now bound.
- **Default filters can no longer be widened.** A repository with a built-in scope (for example soft-delete) could be bypassed by passing an `or` clause. Filters now compose with the default instead of overriding it.
- **Search results hide hidden fields.** `hiddenProperties` (for example `password`) was enforced for Postgres reads, but the Typesense and Meilisearch connectors returned those fields.
- **Dependency errors no longer leak.** A wrapped connector error could expose the raw driver message in the HTTP response's `extra` field. It is now visible only in development.

Bug fixes:

- **`deleteAll({})` no longer wipes the collection.** It used to delete every row; now it throws.
- **A constructor parameter missing `@inject` fails at boot**, with a message naming the class and parameter.
- **Meilisearch errors are classified correctly.** A normal "does this already exist" check on `create()` could look like the search engine being down.
- **A rejected email is retried.** An SMTP rejection was treated as a successful queue job, so the message vanished.
- **Logs keep the error.** `logger.debug('failed: %j', error)` printed `{}` for an `Error`, and nested objects logged as `[Object]`.
- **Uploads cannot escape their target folder.** The static-asset controller also no longer double-decodes, which could turn an encoded `%2F` in a filename into a path separator.
- **Zero-byte files are accepted.**

Enhancements:

- **`NODE_ENV=dev` behaves like development.** It used to fall through to sanitized production-style errors.
- **The boot report is no longer empty.** It lists the booters that ran, per-phase timing and total duration.

## Who is affected

- **Every production app.** The security fixes apply automatically.
- **Code that calls `deleteAll({})`, mixes `@inject` and plain constructor parameters, logs errors with `%j`, relies on `or: []` matching every row, or runs with `NODE_ENV=dev`.** See breaking changes.

## Breaking changes

| If you | Then |
|---|---|
| call `deleteAll({})` expecting a truncate | pass `options: { force: true }` |
| have a constructor mixing `@inject` and plain parameters | decorate every parameter |
| log errors with `%j` | switch to `%s`, or the error's message and stack are dropped |
| rely on `or: []` matching every row | it now matches none |
| set `NODE_ENV=dev` and expected sanitized errors | use `alpha` or `staging` instead |

```typescript
await repository.deleteAll({ where: { status: 'archived' } }); // scoped - unchanged
await repository.deleteAll({ options: { force: true } });      // whole collection - now explicit
await repository.deleteAll({});                                 // now throws
```

Every constructor parameter of a container-instantiated class must carry `@inject`. Mixing was never supported; it now fails at boot:

```
[UserService] Constructor parameter 1 has no @inject | Every parameter of a
container-instantiated class must be decorated - the container cannot supply
an undecorated one
```

## See also

- [Default Filter reference](/references/base/filter-system/default-filter)
- [Array Operators reference](/references/base/filter-system/array-operators)
