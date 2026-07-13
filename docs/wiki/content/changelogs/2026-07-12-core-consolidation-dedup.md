---
title: Core Consolidation & Deduplication
description: Registration mixin functions removed, default-filter merge narrows instead of replacing, isApplicationError added, plus transaction and search fixes
---

# Changelog - 2026-07-12

## Core Consolidation & Deduplication

A consolidation pass across the core framework and helpers: duplicated code paths collapsed onto a single implementation, one filter-merge law tightened so a default scope can no longer be widened, a boot-time hang closed, and a shape-based error guard added for the cross-package error identity problem. The breaking and behavior changes come first, each with before/after code; the new export, the fixes, and the internal consolidations follow.

## Overview

- **Registration mixin functions removed** - `RepositoryMixin` / `ServiceMixin` / `ComponentMixin` were verbatim duplicates of `BaseApplication`'s own methods; call the methods directly. The `I*Mixin` **interfaces** remain.
- **Postgres default-filter merge narrows instead of replacing** - a same-key operator collision is now AND-composed, so a default `createdAt` floor or tenant `inq` can no longer be dropped or widened by a user filter.
- **`SocketIOServerHelper.configure()` fails fast after 30s** - a Redis client that never reaches `ready` no longer hangs boot forever.
- **`BasePoolHelper.use({ fn })` renamed to `use({ execution })`** - the pool API is new this window, so there is no deprecated alias.
- **`isApplicationError(error)` added** - a shape-based guard for recognizing an application error across package boundaries, where `instanceof` is unsafe.

## Breaking Changes

> [!WARNING]
> This section contains changes that require migration or manual updates to existing code.

### 1. Registration mixin functions removed

The exported class-mixin **functions** `RepositoryMixin`, `ServiceMixin`, and `ComponentMixin` have been removed. They duplicated `BaseApplication`'s `repository()` / `dataSource()` / `service()` / `component()` methods verbatim, had drifted out of sync with them, and had no known consumers.

The capability **interfaces** `IRepositoryMixin`, `IServiceMixin`, and `IComponentMixin` are **unchanged** - `IRestApplication` still implements them, so typed application contracts keep compiling.

**Migration:** extend `BaseApplication` and call its registration methods directly - there was never anything to compose these functions onto other than `AbstractApplication`, and `BaseApplication` already provides the full surface.

**Before:**

```typescript
import { AbstractApplication, ComponentMixin, RepositoryMixin, ServiceMixin } from '@venizia/ignis';

class CustomApplication extends ComponentMixin(
  ServiceMixin(RepositoryMixin(AbstractApplication)),
) {
  // service(), repository(), dataSource(), component() came from the mixins
}
```

**After:**

```typescript
import { BaseApplication } from '@venizia/ignis';

class CustomApplication extends BaseApplication {
  // service(), repository(), dataSource(), component() are already here
}
```

### 2. Postgres default-filter merge is now a narrowing rule

The same-key collision law in `mergeFilter` changed from **"a user key replaces the default wholesale"** to a **narrowing** rule. Within `where`:

- **scalar over scalar** stays a user-wins override (this is the soft-delete opt-out - flipping `isDeleted: false` to `true`).
- **every other combination** (operator+operator, scalar+operator, operator+scalar) is **AND-composed** into an `and: [...]` group, appended to any existing `and`. Both the default and the user condition survive.
- the `and` / `or` keys themselves stay **user-wins**.

  > [!NOTE]
  > Superseded on 2026-07-13: an incoming `or` was found to AND-compose with the default rather than replace it, so it can no longer swallow the default filter's scope. See [The Hardening Round](./2026-07-13-hardening-round).

- a user value of `undefined` **never** overrides a defined default.

**Consequence:** a default scope (a `createdAt` floor, a tenant `inq`) can no longer be widened or dropped by a user filter. Only a bare scalar-over-scalar collision is still a true override.

**Before** (wholesale replace - the user key dropped the default's floor):

```typescript
// default: { where: { createdAt: { gte: '2024-01-01' }, tenantId: { inq: ['t1', 't2'] } } }
// user:    { where: { createdAt: { lte: '2024-12-31' } } }

// merged (old law) - the gte floor is gone, the window is now unbounded below
{ where: { createdAt: { lte: '2024-12-31' }, tenantId: { inq: ['t1', 't2'] } } }
```

**After** (narrowing - operator over operator is AND-composed, the floor survives):

```typescript
{
  where: {
    tenantId: { inq: ['t1', 't2'] },
    and: [
      { createdAt: { gte: '2024-01-01' } },
      { createdAt: { lte: '2024-12-31' } },
    ],
  },
}
```

### 3. `BasePoolHelper.use({ fn })` renamed to `use({ execution })`

The generic pool helper's borrow-and-run method takes its callback under `execution` rather than `fn`. The pool API is new in this release window, so there is no deprecated alias.

```typescript
// Before
await pool.use({ fn: (resource) => resource.doWork() });

// After
await pool.use({ execution: (resource) => resource.doWork() });
```

## Behavior Changes

### `SocketIOServerHelper.configure()` fails fast on an unready Redis

`configure()` now rejects after **30 seconds** if a Redis client (pub, sub, or emitter) never reaches the `ready` state, instead of awaiting it indefinitely and hanging boot forever. `WebsocketServerHelper` and `WebsocketEmitterHelper` already had this timeout; the Socket.IO server now shares the same `waitForRedisReady` guard.

## New Features

### `isApplicationError(error)`

**File:** `packages/helpers/src/modules/error/app-error.ts`

`isApplicationError` is now exported from `@venizia/ignis-helpers`. It recognizes an application error by **shape** - an `Error` instance carrying a numeric `statusCode` - not by class identity.

```typescript
import { isApplicationError } from '@venizia/ignis-helpers';

try {
  await connector.search(input);
} catch (error) {
  if (isApplicationError(error)) {
    // already shaped (has statusCode) - surface as-is
    throw error;
  }
  // unknown engine failure - sanitize to a 503
}
```

**Why shape, not `instanceof`:** never compare `ApplicationError` with `instanceof` across a package boundary. `inversion` ships **dual CJS + ESM** builds (its DI powers frontend libraries), so its error class deliberately has more than one runtime identity; `helpers` keeps its own `ApplicationError` for the backend stack. Two objects that are both "an application error" can therefore be instances of different classes. The search connectors use `isApplicationError` to decide what is already shaped versus what must be sanitized as a `503`.

## Bug Fixes

### Failed lazy driver resolution is no longer cached forever

**File:** `packages/core/src/connectors/postgres/datasources`

A datasource resolves its database driver lazily on first use. Previously a single transient failure during that resolution was cached permanently, poisoning the datasource for the life of the process - every later transaction reused the failed result. The failure is no longer cached: the next transaction retries the resolution.

### Meilisearch `importDocuments` no longer re-wraps an already-shaped failure

**File:** `packages/core/src/connectors/meilisearch/connector.ts`

An `importDocuments` failure that already carried a shaped error (`waitForTask`'s `504` `task_timeout`, or a task-failed `503`) was being re-wrapped as a generic `503`, losing the specific status and code. The shaped error now surfaces **as-is**, with partial progress (`totalCount` / `processedCount`) merged onto `error.extra.details` so callers can resume from the failure point.

### Typesense `toWhere` no longer emits a malformed filter

**File:** `packages/core/src/connectors/typesense/compiler.ts`

When a logical group compiled to nothing, `toWhere` emitted a malformed leading-operator filter (`" && x"`). Empty fragments are now filtered out before joining, matching Meilisearch's dialect behavior.

### `SwaggerBindingKeys.SWAGGER_OPTIONS` marked deprecated at the member level

**File:** `packages/core/src/components`

`SwaggerBindingKeys.SWAGGER_OPTIONS` now carries a member-level `@deprecated` tag. Use `ApiReferenceBindingKeys.API_REFERENCE_OPTIONS` (the binding-key value is shared, so either constant resolves the same binding).

## Internal

Consolidations with no public-surface change: a `Storage` `upload()` template method (public surface unchanged); a shared `waitForRedisReady` / `ensureRedisClientsConnecting` used by the socket helpers; a Kafka `closeClientWithCallback`; `measure()` / `denyOperation` / `buildDataRange` consolidations; mail executor types consolidated; a JWT token-service test suite (15 tests covering signing, expiry, and encryption); and JSDoc on the `ITransaction` contract plus a reusable transaction-contract test suite.

## Files Changed

| File | Changes |
|------|---------|
| `packages/core/src/base/mixins/index.ts` | Stop exporting the `*Mixin` functions; the file now re-exports `./types` only |
| `packages/core/src/base/mixins/types.ts` | `IRepositoryMixin` / `IServiceMixin` / `IComponentMixin` interfaces retained |
| `packages/core/src/connectors/postgres/repositories/dialect/filter.ts` | `mergeFilter` narrowing collision law |
| `packages/core/src/connectors/postgres/datasources` | Failed lazy driver resolution no longer cached |
| `packages/core/src/connectors/meilisearch/connector.ts` | `importDocuments` surfaces the shaped failure as-is with partial progress |
| `packages/core/src/connectors/typesense/compiler.ts` | `toWhere` filters empty fragments before joining |
| `packages/helpers/src/modules/pool/helper.ts` | `use({ fn })` renamed to `use({ execution })` |
| `packages/helpers/src/modules/socket/socket-io/server/helper.ts` | 30s `waitForRedisReady` timeout in `configure()` |
| `packages/helpers/src/modules/error/app-error.ts` | `isApplicationError` shape guard exported |

## Migration Guide

> [!NOTE]
> Follow these steps if you are upgrading from a previous version.

### Step 1: Replace any mixin-function composition

If you composed `RepositoryMixin` / `ServiceMixin` / `ComponentMixin` onto `AbstractApplication`, extend `BaseApplication` instead and drop the composition - the registration methods are already on it. Keep any use of the `I*Mixin` interfaces; they are unchanged.

### Step 2: Re-check default filters that relied on wholesale replacement

If a caller previously overrode a default operator scope (a `createdAt` floor, a tenant range) by passing the same key, that override no longer widens the scope - the two conditions are AND-composed. Audit any default filter whose intent was for user input to relax it; use `shouldSkipDefaultFilter` where a genuine bypass is required.

### Step 3: Rename `pool.use({ fn })` to `pool.use({ execution })`

```typescript
// before
await pool.use({ fn: (resource) => resource.doWork() });
// after
await pool.use({ execution: (resource) => resource.doWork() });
```

### Step 4: Prefer `isApplicationError` over cross-package `instanceof`

Replace any `error instanceof ApplicationError` check that can see errors thrown from a different package with `isApplicationError(error)`.
