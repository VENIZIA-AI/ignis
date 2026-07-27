---
title: Statuses
description: A shared catalog of lifecycle status codes and binding-namespace constants
difficulty: beginner
lastUpdated: 2026-07-16
---

# Statuses

`Statuses` is a static catalog of lifecycle status codes - a shared vocabulary. Every entity in an app uses the same strings for "draft", "active", "failed", and so on.

## In one example

```typescript
import { Statuses } from '@venizia/ignis';

const job = await jobRepository.create({
  data: { name: 'send-email', status: Statuses.QUEUED },
});

// Later, react to the current lifecycle phase
if (Statuses.isActive(job.status)) {
  console.log('Job is running');
} else if (Statuses.isFailed(job.status)) {
  console.log('Job failed permanently');
}
```

## How it works

- **HTTP-inspired numeric prefix.** Each status is a `'NNN_NAME'` string (e.g. `'302_SUCCESS'`). The leading digit groups statuses into six phases.
- **Group sets for classification.** Every phase has a matching `*_SCHEME_SET` (a `Set<string>`) plus a validator method (`isActive`, `isFailed`, etc.) that just checks set membership.
- **Specialized classes narrow the catalog.** `MigrationStatuses`, `CommonStatuses`, `UserStatuses`, and `RoleStatuses` each expose a small, named subset of `Statuses` values for a specific use case. None of them invent new status strings.
- **A separate constant catalog for DI.** `BindingNamespaces` and `CoreBindings` (in the same file area) are unrelated to entity lifecycle. They're the namespace/key strings the container uses for dependency injection.

**The six phases**

| Prefix | Phase | Meaning | Reversibility |
|--------|-------|---------|----------------|
| `0xx` | Initial | Entity creation/draft state | N/A |
| `1xx` | Pending | Awaiting action or decision | Reversible |
| `2xx` | Active | In progress or running | Reversible |
| `3xx` | Completed | Positive terminal state | Terminal |
| `4xx` | Inactive | Negative but reversible | Reversible |
| `5xx` | Failed | Negative terminal state | Terminal |

**Specialized classes**

| Class | Scope |
|-------|-------|
| `MigrationStatuses` | `UNKNOWN` / `SUCCESS` / `FAIL` - database migration tracking |
| `CommonStatuses` | `UNKNOWN` / `ACTIVATED` / `DEACTIVATED` / `BLOCKED` / `ARCHIVED` - shared entity states |
| `UserStatuses` | Extends `CommonStatuses` with no additions - user account states |
| `RoleStatuses` | Extends `CommonStatuses` with no additions - role lifecycle states |

## Common tasks

**Set a status on create or update.** Use the `Statuses` constant, never a raw string literal.

```typescript
await orderRepository.updateById({
  id: orderId,
  data: { status: Statuses.PROCESSING },
});
```

**Check whether a status belongs to a phase.** Each phase has an `is*` helper.

```typescript
if (Statuses.isCompleted(order.status) || Statuses.isFailed(order.status)) {
  throw getError({ message: 'Cannot modify a terminal order' });
}
```

**Filter a query by phase.** Spread a `*_SCHEME_SET` into an `inq` operator.

```typescript
const retryableJobs = await jobRepository.find({
  filter: { where: { status: { inq: [...Statuses.FAILED_SCHEME_SET] } } },
});
```

**Validate an incoming status string.** `isValid` guards against typos before a write.

```typescript
if (!Statuses.isValid(newStatus)) {
  throw getError({ message: `Invalid status: ${newStatus}` });
}
```

**Use a narrowed catalog for a specific domain.** `CommonStatuses` (and `UserStatuses`/`RoleStatuses`, which extend it) expose only the values relevant to users and roles.

```typescript
import { UserStatuses } from '@venizia/ignis';

await userRepository.updateById({
  id: userId,
  data: { status: UserStatuses.ACTIVATED },
});
```

**Classify a user by type.** `UserTypes` is a separate, unrelated catalog (`SYSTEM` vs `LINKED`), not a status.

```typescript
import { UserTypes } from '@venizia/ignis';

await userRepository.create({
  data: { email: 'system@app.com', type: UserTypes.SYSTEM, status: UserStatuses.ACTIVATED },
});
```

## See also

- [Full reference](/references/utilities/statuses-reference) - every status code, group set, specialized class, and binding constant
- [Models](/references/base/models) - entity definitions that carry a `status` column
- [Repositories](/references/base/repositories/) - querying and updating by status
- [Filter System](/references/base/filter-system/) - `inq`/`nin` operators used with `*_SCHEME_SET`

**Files:**

- [`packages/core/src/common/statuses.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/common/statuses.ts)
- [`packages/core/src/common/bindings.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/common/bindings.ts)
