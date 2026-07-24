---
title: Core Consolidation and Deduplication
description: Registration mixin functions removed in favor of BaseApplication methods, default-filter merge now narrows instead of replacing, a new isApplicationError guard, plus fixes to datasource driver caching, Meilisearch, and Typesense.
---

# Changelog - 2026-07-12

## Core Consolidation and Deduplication

<Badge type="warning" text="Breaking Change" /> <Badge type="info" text="Bug Fix" /> <Badge type="tip" text="Enhancement" /> <Badge type="info" text="New API" />

**In one line.** Duplicated registration code is gone, replaced by `BaseApplication`'s own methods. The default-filter merge now narrows instead of replacing, and three underlying bugs are fixed.

## The problem it solves

`RepositoryMixin`, `ServiceMixin`, and `ComponentMixin` duplicated methods `BaseApplication` already had. Worse, a user filter on the same key as a default scope replaced it outright, instead of narrowing it:

```typescript
// default: { where: { tenantId: { inq: ['t1', 't2'] } } }
// user:    { where: { tenantId: { inq: ['t3'] } } }
// before: tenantId: { inq: ['t3'] } - the default tenant scope is gone
```

Same-key collisions now combine with `AND`, so the default scope always survives.

## What changed

- **`RepositoryMixin`, `ServiceMixin`, and `ComponentMixin` functions removed.** They were verbatim duplicates of methods already on `BaseApplication`. The capability interfaces (`IRepositoryMixin`, etc.) are unchanged.
- **A default filter can no longer be widened or dropped by a user filter.** Previously, a user filter on the same key as a default scope (a tenant restriction, a date floor) replaced it outright.
  - IGNIS now combines same-key collisions with `AND` instead, so the default scope always survives.
- **`BasePoolHelper.use({ fn })` renamed to `use({ execution })`.** The pool API is new this release window, so no deprecated alias exists.
- **`SocketIOServerHelper.configure()` now fails after 30 seconds** if Redis never becomes ready, instead of hanging boot indefinitely.
- **New: `isApplicationError(error)`.** A shape-based check for recognizing an application error across package boundaries, where `instanceof` is unsafe.
- **Three bugs fixed:**
  - A datasource that failed to resolve its driver once stayed broken forever, instead of retrying on the next use.
  - A Meilisearch `importDocuments` failure lost its real HTTP status, re-wrapped as a generic error.
  - Typesense's filter compiler could emit a malformed query string when a filter group compiled to nothing.
- **`SwaggerBindingKeys.SWAGGER_OPTIONS` deprecated** in favor of `ApiReferenceBindingKeys.API_REFERENCE_OPTIONS` (same underlying binding, so both still resolve correctly).

## Who is affected

- **Applications composing `RepositoryMixin` / `ServiceMixin` / `ComponentMixin` onto `AbstractApplication`.** Breaking - extend `BaseApplication` directly instead. See below.
- **Applications whose default filters were relying on a user filter overriding them (not just narrowing them).** Breaking - see below. Use `shouldSkipDefaultFilter` if a genuine bypass is required.
- **Anyone calling `pool.use({ fn })`.** Breaking - rename to `use({ execution })`. See below.
- **Anyone doing `error instanceof ApplicationError` across a package boundary.** Should switch to `isApplicationError(error)`, which works reliably where `instanceof` does not.
- **Everyone else** - the datasource, Meilisearch, Typesense, and Redis-timeout fixes apply automatically, no action needed.

## Breaking changes

**1. Registration mixin functions removed.**

```typescript
// Before
import { AbstractApplication, ComponentMixin, RepositoryMixin, ServiceMixin } from '@venizia/ignis';

class CustomApplication extends ComponentMixin(
  ServiceMixin(RepositoryMixin(AbstractApplication)),
) {}

// After
import { BaseApplication } from '@venizia/ignis';

class CustomApplication extends BaseApplication {
  // service(), repository(), dataSource(), component() are already here
}
```

**2. Default-filter merge now narrows instead of replacing.**

```typescript
// default: { where: { createdAt: { gte: '2024-01-01' }, tenantId: { inq: ['t1', 't2'] } } }
// user:    { where: { createdAt: { lte: '2024-12-31' } } }

// Before - the default's floor was dropped
{ where: { createdAt: { lte: '2024-12-31' }, tenantId: { inq: ['t1', 't2'] } } }

// After - both conditions survive, AND-composed
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

A bare scalar-over-scalar collision (for example, flipping `isDeleted: false` to `true`) is still a user-wins override - only operator collisions changed.

> [!NOTE]
> The next day, this rule tightened further: an incoming `or` clause could still bypass a default filter. See [Security and Reliability Hardening](./2026-07-13-hardening-round).

**3. `BasePoolHelper.use({ fn })` renamed to `use({ execution })`.**

```typescript
// Before
await pool.use({ fn: (resource) => resource.doWork() });

// After
await pool.use({ execution: (resource) => resource.doWork() });
```

## Details

```typescript
import { isApplicationError } from '@venizia/ignis-helpers';

try {
  await connector.search(input);
} catch (error) {
  if (isApplicationError(error)) {
    throw error; // already shaped - surface as-is
  }
  // unknown engine failure - sanitize to a 503
}
```

`isApplicationError` checks shape (an `Error` carrying a numeric `statusCode`), not class identity. `inversion` ships dual CJS and ESM builds, so its error class has more than one runtime identity - and `helpers` keeps its own separate `ApplicationError` for the backend stack.

Also included, with no public-surface change: a shared `Storage.upload()` template method and a shared Redis-readiness wait used by the socket helpers. Test suites for JWT and transaction contracts are now consolidated too.

## See also

- [Repository Mixins reference](/references/base/repositories/mixins) - the capability interfaces `BaseApplication` now implements directly
- [Default Filter reference](/references/base/filter-system/default-filter) - the merge rule this changelog tightened
- [Security and Reliability Hardening](./2026-07-13-hardening-round) - closed the remaining `or`-clause bypass the next day
