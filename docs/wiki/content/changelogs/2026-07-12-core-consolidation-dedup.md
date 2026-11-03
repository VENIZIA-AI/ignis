---
title: Core Consolidation and Deduplication
description: The registration mixin functions are removed in favor of BaseApplication methods, the default-filter merge now narrows instead of replacing, and there is a new isApplicationError guard.
packages: ['@venizia/ignis', '@venizia/ignis-helpers']
---

# Changelog - 2026-07-12

## Core Consolidation and Deduplication

<Badge type="warning" text="Breaking Change" /> <Badge type="info" text="Bug Fix" /> <Badge type="tip" text="Enhancement" /> <Badge type="info" text="New API" />

**In one line.** A user filter can no longer drop a default scope such as a tenant restriction, and you extend `BaseApplication` directly instead of composing mixins.

## What changed

- **Mixin functions removed.** `RepositoryMixin`, `ServiceMixin` and `ComponentMixin` duplicated methods `BaseApplication` already has. The interfaces (`IRepositoryMixin`, etc.) are unchanged.
- **Default filters narrow, not replace.** Before, a user filter on the same key as a default scope (a tenant restriction, a date floor) replaced it. Same-key operator collisions are now combined with `AND`, so the default scope survives.
- **`BasePoolHelper.use({ fn })` is now `use({ execution })`.** No deprecated alias.
- **Redis wait.** `SocketIOServerHelper.configure()` now fails after 30 seconds if Redis never becomes ready, instead of hanging boot.
- **New `isApplicationError(error)`.** A shape-based check for an application error across package boundaries, where `instanceof` is unsafe.
- **Fixes.** A datasource that failed to resolve its driver once no longer stays broken; it retries on next use. A Meilisearch `importDocuments` failure keeps its real HTTP status. Typesense's filter compiler no longer emits a malformed query string when a filter group compiles to nothing.
- **Deprecated.** `SwaggerBindingKeys.SWAGGER_OPTIONS` in favor of `ApiReferenceBindingKeys.API_REFERENCE_OPTIONS` (same binding).

```typescript
import { isApplicationError } from '@venizia/ignis-helpers';

if (isApplicationError(error)) {
  throw error;
}
```

## Who is affected

- **Apps composing the mixins onto `AbstractApplication`.** Extend `BaseApplication` instead.
- **Apps whose code relied on a user filter overriding a default filter.** Use `shouldSkipDefaultFilter` for a genuine bypass.
- **Callers of `pool.use({ fn })`.** Rename to `execution`.
- **Code doing `error instanceof ApplicationError` across a package boundary.** Switch to `isApplicationError(error)`.
- **Everyone else.** No action needed.

## Breaking changes

1. **Registration mixin functions removed.**

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

2. **Default-filter merge narrows.** A bare scalar over scalar collision (for example `isDeleted: false` to `true`) is still a user-wins override. Only operator collisions changed. The next day this tightened further for `or` clauses: see [Security and Reliability Hardening](./2026-07-13-hardening-round).

   ```typescript
   // default: { where: { createdAt: { gte: '2024-01-01' }, tenantId: { inq: ['t1', 't2'] } } }
   // user:    { where: { createdAt: { lte: '2024-12-31' } } }

   // Before - the default's floor was dropped
   { where: { createdAt: { lte: '2024-12-31' }, tenantId: { inq: ['t1', 't2'] } } }

   // After - both conditions survive
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

3. **`BasePoolHelper.use({ fn })` renamed.**

   ```typescript
   // Before
   await pool.use({ fn: (resource) => resource.doWork() });

   // After
   await pool.use({ execution: (resource) => resource.doWork() });
   ```

## Details

- `isApplicationError` checks for an `Error` carrying a numeric `statusCode`, not class identity. `inversion` ships dual CJS and ESM builds, so its error class has more than one runtime identity, and `helpers` keeps its own separate `ApplicationError`.

## See also

- [What moved from the removed repository mixins](/references/base/repositories/advanced#moved-from-the-removed-mixins)
- [Default Filter reference](/references/base/filter-system/default-filter)
- [Security and Reliability Hardening](./2026-07-13-hardening-round)
