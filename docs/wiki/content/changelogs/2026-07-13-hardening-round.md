---
title: The Hardening Round - SQL Injection, Scope Escapes and Silent Leaks
description: A five-package audit that found a live SQL injection in the array operators, two filter scope escapes, hidden fields leaking out of search reads, and a deleteAll that would truncate a collection without being asked
---

# Changelog - 2026-07-13

## The Hardening Round

<Badge type="danger" text="Security" /> <Badge type="warning" text="Breaking Change" /> <Badge type="info" text="Bug Fix" /> <Badge type="tip" text="Enhancement" />

We pointed a review at every package in the build chain and asked one question of each line: what input makes this wrong? The honest answer, thirteen times, was "one a user can send".

Every fix below was written test-first, and every test was then mutation-checked: revert the fix, watch the test go red. A test that stays green against the broken code proves nothing, and this round found several of those too.

Each section names the **symptom** a user would have hit, the **cause** underneath it, and the **change** that closed it.

## Overview

| | |
|---|---|
| **Bugs closed** | 13 |
| **SQL injections** | 1 |
| **Tests passing** | 2714 (inversion 96, helpers 1014, boot 81, core 1523) |

## Security: SQL injection through an array operator

**Symptom.** This URL ran arbitrary SQL:

```
GET /users?filter={"where":{"tags":{"overlaps":[1,"1); DROP TABLE users; --"]}}}
```

**Cause.** The Postgres array operators (`overlaps`, `contains`) built their right-hand side by string-concatenating the filter values into an `ARRAY[...]` literal, then handing the whole thing to `sql.raw`. Parameter binding was never reached. Every other operator in the dialect bound its values; these two did not, because the array literal was assembled before the query was.

**Change.** The values are bound and the operator alone is raw:

```typescript
const items = sql.join(
  value.map(item => sql`${item}`),
  sql`, `,
);

const isNumericOrBoolean = typeof value[0] === 'number' || typeof value[0] === 'boolean';
if (isNumericOrBoolean) {
  return sql`${column} ${sql.raw(operator)} ARRAY[${items}]`;
}

return sql`${column}::text[] ${sql.raw(operator)} ARRAY[${items}]::text[]`;
```

`operator` is a framework constant, never user input. The `::text[]` cast preserves the previous behaviour for string arrays, where Postgres would otherwise infer the element type from the first item.

## Security: filters could escape their own scope

**Symptom.** A repository with `defaultFilter: { isDeleted: false }` returned deleted rows as soon as the caller passed an `or`:

```typescript
await userRepository.find({ filter: { where: { or: [{ id: 1 }, { id: 2 }] } } });
// soft-deleted rows came back
```

**Cause.** `mergeWhere` concatenated the caller's clause into the default's, so an `or` at the top level absorbed the default `and` instead of being nested under it. The scope of the default filter was silently widened by whatever the caller sent.

**Change.** The merge now composes rather than concatenates: an incoming `and` is appended, and an incoming `or` is wrapped so that it is `AND`-composed with the default. The default filter is a floor, and a filter can no longer dig under it.

An empty `or: []` used to compile to nothing at all, matching every row. It now compiles to `false`, which is what an empty disjunction means. An empty `and: []` is dropped, which is what an empty conjunction means.

## Security: search reads returned the fields you told them to hide

**Symptom.** `@model({ settings: { hiddenProperties: ['password'] } })` was honoured by Postgres and ignored by the search connectors. `find()` and `search()` both returned the hidden fields.

**Cause.** Postgres excludes hidden fields in SQL - it never selects the column. The search connectors had no equivalent: the engine returns the whole document, and nothing stripped it afterwards. The setting was read and then dropped.

**Change.** The read path strips them in JS, for every hit and every engine (`omitHiddenFieldsAll` in `find`, per-hit `omitHiddenFields` in `search`). The exclusion is now enforced wherever a document leaves the framework, not only where the engine happens to support projection.

## Security: dependency errors carried their cause onto the wire

**Symptom.** A wrapped connector error could put the underlying driver's message into the `extra` field of an HTTP response.

**Cause.** `wrapDependencyError` passed `cause` into the error constructor, and `extra` is serialised to the client.

**Change.** `cause` is attached after construction, so it stays out of `extra` and surfaces only in development, where the error is rendered in full. Production responses leak nothing about the engine underneath.

## Breaking: deleteAll() truncated the whole collection when you passed nothing

**Symptom.** `await repository.deleteAll({})` deleted every document. No error, no warning - the same call shape a bug in a caller would produce.

**Change.** Deleting everything is now something you have to say out loud:

```typescript
await repository.deleteAll({ where: { status: 'archived' } }); // scoped, as before
await repository.deleteAll({ options: { force: true } }); // whole collection, deliberate
await repository.deleteAll({}); // throws
```

This mirrors the mass-mutation guards the SQL side already had.

## Breaking: a constructor parameter without @inject now fails loudly

**Symptom.** A class whose constructor mixed decorated and undecorated parameters crashed deep inside the container, with an error that pointed nowhere near the cause.

**Cause.** Parameter decorators run right to left, so the metadata array for such a constructor has a **hole** in it. The container sorted that array before reading it - and `Array.prototype.sort` skips holes without calling the comparator, which quietly moved the gap to the end and shifted every argument after it. The failure surfaced as a mis-wired dependency somewhere else entirely.

**Change.** The sort is gone (assignment is by index, so it was never needed) and the hole is now the error:

```
[UserService] Constructor parameter 1 has no @inject | Every parameter of a
container-instantiated class must be decorated - the container cannot supply
an undecorated one
```

This is not a limitation that was papered over. It is the rule: **every** constructor parameter of a container-instantiated class carries `@inject`. Mixing decorated and undecorated parameters was never supported, and now it says so at the first instantiation instead of at some confusing later one.

## Bug Fix: Meilisearch errors were classified by reading fields the SDK does not set

**Symptom.** Creating a brand-new document reported the search engine as down.

**Cause.** A Meilisearch failure arrives in two shapes, and the classifier only knew the wrong one. `MeilisearchApiError` - what the SDK actually throws - carries the body on `cause` and the status on `response.status`. It has no top-level `code` and no `httpStatus`. The classifier read exactly those two, so every question it asked answered `false`: `create()` probes for an existing document, the probe 404s, the 404 fails to be recognised as not-found, and a by-design miss became a 503.

The test suite stayed green through all of it, because the fake client synthesised a flat `{ code, httpStatus }` error that Meilisearch never produces. The fake was fixed first.

**Change.** The classifier reads both shapes: the thrown `MeilisearchApiError` and the flat `MeilisearchErrorResponse` that hangs off a failed task. `createCollection` is idempotent too - an `index_already_exists` failure is tolerated and logged instead of crashing provisioning on a restart.

## Bug Fix: a queued email the SMTP server rejected was reported as delivered

**Symptom.** The transport returned `{ success: false }`, the queue marked the job **completed**, and the mail was gone: no retry, no dead-letter queue, no error the caller would ever see.

**Cause.** A processor reports an SMTP rejection by *returning* `{ success: false }` - that is what `IMailProcessorResult` is for. But a queue only sees a **rejection** as a failure. Resolving with a failure object is, to BullMQ, a successful job.

**Change.** Both queue executors translate a returned failure into a thrown one, so the queue's retry and backoff policy applies to a rejected email exactly as it does to a crashed one. Separately, the internal queue executor's `close()` now releases its pending delay and backoff timers - an unsent job used to keep a live `setTimeout` handle that held the event loop open past shutdown.

## Bug Fix: logs dropped the object you were trying to read

**Symptom.** `logger.debug('failed: %j', error)` printed `{}`, and nested objects logged with `%s` printed `[Object]` one level in.

**Cause.** Two separate facts about Node. `%j` is `JSON.stringify`, and an `Error`'s `message` and `stack` are non-enumerable - so JSON drops them and you get `{}`. Meanwhile `util.format` hard-codes `depth: 0` for `%s`, and no inspect option overrides it.

**Change.** A `deepSplat` formatter replaces `winston.format.splat()`. It widens the inspect depth for `%s` arguments only (widening all of them would break `%j`), and the depth is configurable:

```bash
APP_ENV_LOGGER_INSPECT_DEPTH=5   # the default; negative values are rejected
```

The house rule that follows: **log errors with `%s`, never `%j`.** Every framework log line was converted.

## Bug Fix: uploads could climb out of their folder, and empty files were rejected

**Symptom.** A path with one more folder level than `maxFolderDepth` allowed was accepted, and a legitimately zero-byte file was refused.

**Cause.** The depth check ran through `isValidPath`, which counts the final segment as a filename - so a folder path was always measured one level short. Separately, the static-asset controller decoded the object path a second time after Hono had already decoded it, which turned an encoded `%2F` in a filename into a real separator.

**Change.** `upload({ ..., maxFolderDepth })` checks the folder path directly, the double-decode is gone (the controller reads the name Hono already gave it), zero-byte files are legal, and the output of a custom `normalizeNameFn` is validated rather than trusted.

## Enhancement: dev is a development environment

**Symptom.** `NODE_ENV=dev` got production error responses: sanitized, no stack, no cause. The environment gate is fail-closed, and `dev` was not on the list.

**Change.** `dev` is now an alias of `development` - it is in both the common set and the development set. Being in only one silences `DEBUG=true` entirely, which is a fun half-hour to spend. `alpha` and `staging` remain sanitized, as intended.

## Enhancement: one isClass, and a boot report that reports

**Cause.** Three packages had their own answer to "is this a class?", and they disagreed. The one in the container checked `typeof === 'function'`, which is also true of every arrow function ever passed to it.

**Change.** `isClass` lives in `inversion` and is re-exported from `helpers`. It tests class **syntax** (`/^class[\s{]/` against `Function.prototype.toString`), which is sound because the toolchain targets ES2024 and no longer down-levels classes to functions.

`IBootReport` was declared `{}` - the boot phase produced no evidence at all. It now carries what a boot is worth knowing about:

```typescript
interface IBootReport {
  booters: string[]; // the booters that ran, in order
  phases: IBootPhaseReport[]; // { phase, durationMs }
  totalDurationMs: number;
}
```

Two other boot corrections ride along: `loadClasses({ files })` no longer takes the `root` it never used, and `configure()` no longer spreads the raw options last - an explicit `undefined` in a per-type option (`dirs: process.env.APP_DIRS?.split(',')`) used to overwrite the computed default with nothing.

## Migration Guide

> [!WARNING]
> Two of the changes above break callers. Everything else is a fix you get for free.

| If you | Then |
|--------|------|
| call `deleteAll({})` expecting a truncate | pass `options: { force: true }` |
| have a constructor mixing `@inject` and plain parameters | decorate every parameter - it was already unsupported |
| log errors with `%j` | switch to `%s`, or the message and stack are dropped |
| rely on `or: []` matching every row | it now matches none, which is what it means |
| set `NODE_ENV=dev` | you now get development error responses; use `alpha` or `staging` if you wanted them sanitized |

## Verification

The whole chain, cold: **inversion 96, helpers 1014, boot 81, core 1523** tests passing, 0 failing. Zero lint findings and zero type errors across all four packages, all nine examples type-check, and the dual CJS + ESM build of `inversion` is intact.
