---
title: Security and Reliability Hardening - SQL Injection, Filter Scope, and 11 More Fixes
description: A full audit across the framework closed a live SQL injection in array filters, two ways a default filter's scope could be bypassed, hidden fields leaking from search results, and ten other bugs in errors, logging, uploads, and boot.
---

# Changelog - 2026-07-13

## Security and Reliability Hardening

<Badge type="danger" text="Security" /> <Badge type="warning" text="Breaking Change" /> <Badge type="info" text="Bug Fix" /> <Badge type="tip" text="Enhancement" />

**In one line.** A security and reliability audit fixed a live SQL injection, closed two ways a default filter's scope could be bypassed, and fixed ten other bugs across search, logging, uploads, and boot - two of the fixes change existing behavior.

## What changed

### Security

- **SQL injection through array filters, closed.** The `overlaps` and `contains` operators built raw SQL by string-concatenating filter values instead of binding them, so a crafted array value could run arbitrary SQL.
- **Default filters can no longer be widened by a caller.** A repository with a built-in scope (for example, a soft-delete filter) could previously be bypassed by passing an `or` clause. Filters now compose with the default instead of overriding it.
- **Search results now hide the fields they're told to hide.** `hiddenProperties` (for example, `password`) was already enforced for Postgres reads, but the Typesense and Meilisearch connectors were returning those fields anyway.
- **Underlying dependency errors no longer leak onto the wire.** A wrapped connector error could previously expose the raw driver message in the HTTP response's `extra` field. It is now only visible in development.

### Bug fixes

- **`deleteAll({})` no longer wipes the whole collection.** Calling it with no arguments used to delete every row - now it throws, and truncation requires saying so explicitly. See Breaking changes.
- **A constructor missing `@inject` now fails immediately at boot**, with a message naming the class and parameter, instead of causing a confusing mis-wired dependency somewhere else. See Breaking changes.
- **Meilisearch errors are now classified correctly.** A bug in error-shape detection meant a normal "does this already exist" check on `create()` could be misread as the search engine being down.
- **A rejected email is now retried, not marked as delivered.** An SMTP rejection was previously treated as a successful queue job, so the message silently disappeared with no retry.
- **Logs no longer drop the object you're printing.** `logger.debug('failed: %j', error)` used to print `{}` for an `Error`, and nested objects logged one level in as `[Object]`.
- **Uploads can no longer escape their target folder**, and legitimately empty (zero-byte) files are now accepted instead of rejected.

### Enhancements

- **`NODE_ENV=dev` now behaves like a development environment.** It previously fell through to sanitized production-style error responses.
- **Boot now reports what actually happened.** The boot report used to be empty; it now lists the booters that ran, per-phase timing, and total duration.

## Who is affected

- **Every application in production.** The SQL injection fix, the filter-scope fixes, and the search hidden-fields fix apply automatically - no action needed.
- **Anyone calling `deleteAll({})` expecting it to truncate the collection.** Breaking - see below.
- **Anyone with a constructor that mixes `@inject`-decorated and undecorated parameters.** This was already unsupported; it now fails loudly at boot instead of silently mis-wiring dependencies. See below.
- **Anyone logging errors with `%j`.** Switch to `%s`, or the error's message and stack are dropped from the log line.
- **Anyone relying on an empty `or: []` filter matching every row.** It now correctly matches none.
- **Anyone running with `NODE_ENV=dev`.** You now get development-style error responses (stack traces, cause). Use `alpha` or `staging` if you wanted sanitized responses.
- **Everyone else** - no action needed; the remaining fixes apply automatically.

## Breaking changes

**1. `deleteAll({})` now throws instead of truncating.**

```typescript
await repository.deleteAll({ where: { status: 'archived' } }); // scoped - unchanged
await repository.deleteAll({ options: { force: true } });      // whole collection - now explicit
await repository.deleteAll({});                                 // now throws
```

**2. Every constructor parameter of a container-instantiated class must carry `@inject`.**

```
[UserService] Constructor parameter 1 has no @inject | Every parameter of a
container-instantiated class must be decorated - the container cannot supply
an undecorated one
```

Mixing decorated and undecorated constructor parameters was never supported. Decorate every parameter.

| If you | Then |
|---|---|
| call `deleteAll({})` expecting a truncate | pass `options: { force: true }` |
| have a constructor mixing `@inject` and plain parameters | decorate every parameter |
| log errors with `%j` | switch to `%s` |
| rely on `or: []` matching every row | it now matches none |
| set `NODE_ENV=dev` and expected sanitized errors | use `alpha` or `staging` instead |

## Details

- Every fix in this round was written test-first, then mutation-checked: the fix was reverted and the test confirmed to fail. Several existing tests were found to stay green even against the broken code and were corrected first.
- The array-filter fix keeps operator names as framework constants (never user input) and binds only the values, preserving the previous element-type behavior via an explicit cast.
- The uploads fix also removes a double-decode in the static-asset controller that could turn an encoded `%2F` in a filename into a real path separator.

| Metric | Value |
|---|---|
| Bugs closed | 13 |
| SQL injections closed | 1 |
| Tests passing | 2714 (inversion 96, helpers 1014, boot 81, core 1523) |

Zero lint findings and zero type errors across all four packages; all nine examples type-check; the dual CJS + ESM build of `inversion` is intact.
