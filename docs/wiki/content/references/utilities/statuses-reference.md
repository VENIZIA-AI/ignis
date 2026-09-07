---
title: Statuses - Full Reference
description: Complete reference for every status code, group set, specialized status class, and binding-namespace constant
difficulty: beginner
lastUpdated: 2026-07-16
---

# Statuses - Full Reference

Exhaustive reference for `Statuses`, its specialized subclasses, and the `BindingNamespaces`/`CoreBindings` constant catalogs. For an introduction and the common tasks, start with the [Statuses overview](/references/utilities/statuses).

**Files:**

- [`packages/kernel/src/common/statuses/`](https://github.com/VENIZIA-AI/ignis/tree/main/packages/kernel/src/common/statuses)
- [`packages/kernel/src/common/bindings.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/kernel/src/common/bindings.ts)

## `Statuses`

A static class of `'NNN_NAME'` status code constants, grouped by an HTTP-inspired numeric prefix, plus `Set` groupings and validator methods.

`Source ->` [`packages/kernel/src/common/statuses/`](https://github.com/VENIZIA-AI/ignis/tree/main/packages/kernel/src/common/statuses)

### Status code scheme

| Prefix | Category | Meaning | Reversibility |
|--------|----------|---------|----------------|
| `0xx` | Initial | Entity creation/draft state | N/A |
| `1xx` | Pending | Awaiting action or decision | Reversible |
| `2xx` | Active | In progress or running | Reversible |
| `3xx` | Completed | Positive terminal state | Terminal |
| `4xx` | Inactive | Negative but reversible | Reversible |
| `5xx` | Failed | Negative terminal state | Terminal |

### `0xx` - Initial states

| Constant | Value | Description |
|----------|-------|-------------|
| `UNKNOWN` | `'000_UNKNOWN'` | Unknown or uninitialized state |
| `DRAFT` | `'001_DRAFT'` | Draft state, not yet finalized |

### `1xx` - Pending/waiting states

| Constant | Value | Description |
|----------|-------|-------------|
| `NEW` | `'100_NEW'` | Newly created, not yet processed |
| `QUEUED` | `'101_QUEUED'` | Queued for processing |
| `SCHEDULED` | `'102_SCHEDULED'` | Scheduled for future execution |
| `PENDING` | `'103_PENDING'` | Awaiting action or decision |
| `IN_REVIEW` | `'104_IN_REVIEW'` | Under review or approval process |

### `2xx` - Active/running states

| Constant | Value | Description |
|----------|-------|-------------|
| `ENABLED` | `'200_ENABLED'` | Feature or entity is enabled |
| `ACTIVATED` | `'201_ACTIVATED'` | Account or service is active |
| `RUNNING` | `'202_RUNNING'` | Process is currently running |
| `PROCESSING` | `'203_PROCESSING'` | Being actively processed |
| `SENT` | `'204_SENT'` | Message/item has been sent |
| `RECEIVED` | `'205_RECEIVED'` | Message/item has been received |

### `3xx` - Completed states

Positive terminal states.

| Constant | Value | Description |
|----------|-------|-------------|
| `PARTIAL` | `'300_PARTIAL'` | Partially completed |
| `APPROVED` | `'301_APPROVED'` | Approved by reviewer |
| `SUCCESS` | `'302_SUCCESS'` | Successfully completed |
| `COMPLETED` | `'303_COMPLETED'` | Fully completed |
| `SETTLED` | `'304_SETTLED'` | Finalized or settled |
| `CONFIRMED` | `'305_CONFIRMED'` | Confirmed by user or system |

### `4xx` - Inactive states

Negative but reversible - the entity can be reactivated.

| Constant | Value | Description |
|----------|-------|-------------|
| `DISABLED` | `'400_DISABLED'` | Feature or entity is disabled |
| `DEACTIVATED` | `'401_DEACTIVATED'` | Account or service is deactivated |
| `SUSPENDED` | `'402_SUSPENDED'` | Temporarily suspended |
| `BLOCKED` | `'403_BLOCKED'` | Access blocked (e.g. banned user) |
| `CLOSED` | `'404_CLOSED'` | Closed but can be reopened |
| `ARCHIVED` | `'405_ARCHIVED'` | Archived for record keeping |
| `PAUSED` | `'406_PAUSED'` | Paused, can be resumed |
| `REVOKED` | `'407_REVOKED'` | Permission or access revoked |
| `REFUNDED` | `'408_REFUNDED'` | Payment or transaction refunded |

### `5xx` - Failed/error states

Negative terminal states - permanent failure or cancellation.

| Constant | Value | Description |
|----------|-------|-------------|
| `FAIL` | `'500_FAIL'` | General failure |
| `EXPIRED` | `'501_EXPIRED'` | Expired and no longer valid |
| `TIMEOUT` | `'502_TIMEOUT'` | Operation timed out |
| `SKIPPED` | `'503_SKIPPED'` | Intentionally skipped |
| `ABORTED` | `'504_ABORTED'` | Aborted by system |
| `CANCELLED` | `'505_CANCELLED'` | Cancelled by user/admin |
| `DELETED` | `'506_DELETED'` | Soft deleted |
| `REJECTED` | `'507_REJECTED'` | Rejected by reviewer |

### Group sets

Each phase has a static `Set<string>` of its member statuses, plus `SCHEME_SET`, the union of all six.

| Set | Members |
|-----|---------|
| `INITIAL_SCHEME_SET` | `UNKNOWN`, `DRAFT` |
| `PENDING_SCHEME_SET` | `NEW`, `QUEUED`, `SCHEDULED`, `PENDING`, `IN_REVIEW` |
| `ACTIVE_SCHEME_SET` | `ENABLED`, `ACTIVATED`, `RUNNING`, `PROCESSING`, `SENT`, `RECEIVED` |
| `COMPLETED_SCHEME_SET` | `COMPLETED`, `SUCCESS`, `PARTIAL`, `SETTLED`, `APPROVED`, `CONFIRMED` |
| `INACTIVE_SCHEME_SET` | `DISABLED`, `DEACTIVATED`, `SUSPENDED`, `BLOCKED`, `CLOSED`, `ARCHIVED`, `PAUSED`, `REVOKED`, `REFUNDED` |
| `FAILED_SCHEME_SET` | `FAIL`, `EXPIRED`, `TIMEOUT`, `SKIPPED`, `ABORTED`, `CANCELLED`, `DELETED`, `REJECTED` |
| `SCHEME_SET` | All statuses across all six sets combined |

```typescript
import { Statuses } from '@venizia/ignis';

// Membership check
Statuses.ACTIVE_SCHEME_SET.has(order.status);

// Spread into a query operator
await jobRepository.find({
  filter: { where: { status: { inq: [...Statuses.FAILED_SCHEME_SET] } } },
});
```

### Validation methods

Each method checks membership in the matching `*_SCHEME_SET`; all take a `string` and return `boolean`.

| Method | Checks against |
|--------|-----------------|
| `isInitial(status)` | `INITIAL_SCHEME_SET` |
| `isPending(status)` | `PENDING_SCHEME_SET` |
| `isActive(status)` | `ACTIVE_SCHEME_SET` |
| `isCompleted(status)` | `COMPLETED_SCHEME_SET` |
| `isInactive(status)` | `INACTIVE_SCHEME_SET` |
| `isFailed(status)` | `FAILED_SCHEME_SET` |
| `isValid(status)` | `SCHEME_SET` (all statuses) |

```typescript
export class Statuses {
  static isInitial(status: string): boolean;
  static isPending(status: string): boolean;
  static isActive(status: string): boolean;
  static isCompleted(status: string): boolean;
  static isInactive(status: string): boolean;
  static isFailed(status: string): boolean;
  static isValid(status: string): boolean;
}
```

## Specialized status classes

Each specialized class references `Statuses` values directly - it does not define new status strings, only a named subset plus its own `SCHEME_SET` and `isValid()`.

### `MigrationStatuses`

Database migration tracking.

```typescript
export class MigrationStatuses {
  static readonly UNKNOWN = Statuses.UNKNOWN; // '000_UNKNOWN'
  static readonly SUCCESS = Statuses.SUCCESS; // '302_SUCCESS'
  static readonly FAIL = Statuses.FAIL;       // '500_FAIL'

  static readonly SCHEME_SET = new Set([this.UNKNOWN, this.SUCCESS, this.FAIL]);

  static isValid(scheme: string): boolean;
}
```

### `CommonStatuses`

Shared statuses reused across entity types.

```typescript
export class CommonStatuses {
  static readonly UNKNOWN = Statuses.UNKNOWN;             // '000_UNKNOWN'
  static readonly ACTIVATED = Statuses.ACTIVATED;         // '201_ACTIVATED'
  static readonly DEACTIVATED = Statuses.DEACTIVATED;     // '401_DEACTIVATED'
  static readonly BLOCKED = Statuses.BLOCKED;             // '403_BLOCKED'
  static readonly ARCHIVED = Statuses.ARCHIVED;           // '405_ARCHIVED'

  static readonly SCHEME_SET = new Set([
    this.UNKNOWN,
    this.ACTIVATED,
    this.DEACTIVATED,
    this.BLOCKED,
    this.ARCHIVED,
  ]);

  static isValid(scheme: string): boolean;
}
```

### `UserStatuses` / `RoleStatuses`

Both classes `extend CommonStatuses` with an empty body - they add no members of their own, inheriting every constant, `SCHEME_SET`, and `isValid()` unchanged. They exist as distinct, named types for user- and role-domain statuses.

```typescript
export class UserStatuses extends CommonStatuses {}
export class RoleStatuses extends CommonStatuses {}
```

### `UserTypes`

Not a status class - a separate classification of user origin. Unrelated to lifecycle phase.

```typescript
export class UserTypes {
  static readonly SYSTEM = 'SYSTEM'; // System-generated users
  static readonly LINKED = 'LINKED'; // External auth (OAuth, SAML, etc.)

  static readonly SCHEME_SET = new Set([this.SYSTEM, this.LINKED]);

  static isValid(orgType: string): boolean;
}
```

## Binding namespaces

Organizes dependency-injection binding keys by artifact type. Distinct from `Statuses` - not a lifecycle catalog.

`Source ->` [`packages/kernel/src/common/bindings.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/kernel/src/common/bindings.ts)

### `BindingNamespaces`

```typescript
export class BindingNamespaces {
  static readonly COMPONENT = 'components';
  static readonly DATASOURCE = 'datasources';
  static readonly REPOSITORY = 'repositories';
  static readonly MODEL = 'models';
  static readonly SERVICE = 'services';
  static readonly MIDDLEWARE = 'middlewares';
  static readonly PROVIDER = 'providers';
  static readonly CONTROLLER = 'controllers';

  static createNamespace(opts: { name: string }): string;
}
```

Each namespace constant is itself built via `createNamespace()`; the method is also public for constructing custom namespace strings.

`TBindingNamespace` (`TConstValue<typeof BindingNamespaces>`) is the union type of all `BindingNamespaces` values, derived at compile time rather than hand-maintained.

### `CoreBindings`

Application-level binding keys. Extends `BindingKeys` from `@venizia/ignis-inversion`.

```typescript
export class CoreBindings extends BindingKeys {
  static readonly APPLICATION_INSTANCE = '@app/instance';
  static readonly APPLICATION_SERVER = '@app/server';
  static readonly APPLICATION_CONFIG = '@app/config';
  static readonly APPLICATION_PROJECT_ROOT = '@app/project_root';
  static readonly APPLICATION_ROOT_ROUTER = '@app/router/root';
  static readonly APPLICATION_ENVIRONMENTS = '@app/environments';
  static readonly APPLICATION_MIDDLEWARE_OPTIONS = '@app/middleware_options';
}
```

| Constant | Value | Description |
|----------|-------|-------------|
| `APPLICATION_INSTANCE` | `'@app/instance'` | The running application instance |
| `APPLICATION_SERVER` | `'@app/server'` | The underlying HTTP server |
| `APPLICATION_CONFIG` | `'@app/config'` | Resolved application configuration |
| `APPLICATION_PROJECT_ROOT` | `'@app/project_root'` | Absolute path to the project root |
| `APPLICATION_ROOT_ROUTER` | `'@app/router/root'` | The root Hono router |
| `APPLICATION_ENVIRONMENTS` | `'@app/environments'` | Loaded environment variables |
| `APPLICATION_MIDDLEWARE_OPTIONS` | `'@app/middleware_options'` | Global middleware configuration |

```typescript
import { CoreBindings } from '@venizia/ignis';

const app = container.get(CoreBindings.APPLICATION_INSTANCE);
const config = container.get(CoreBindings.APPLICATION_CONFIG);
```

## Usage patterns

### Entity lifecycle in a service

```typescript
import { Statuses } from '@venizia/ignis';

class OrderService extends BaseService {
  async createOrder(data: CreateOrderDto) {
    return this.orderRepository.create({ data: { ...data, status: Statuses.NEW } });
  }

  async processOrder(orderId: string) {
    await this.orderRepository.updateById({
      id: orderId,
      data: { status: Statuses.PROCESSING, startedAt: new Date() },
    });

    try {
      await this.paymentService.charge(orderId);
      await this.orderRepository.updateById({
        id: orderId,
        data: { status: Statuses.COMPLETED, completedAt: new Date() },
      });
    } catch (error) {
      await this.orderRepository.updateById({
        id: orderId,
        data: { status: Statuses.FAIL, failedAt: new Date() },
      });
      throw error;
    }
  }

  async cancelOrder(orderId: string) {
    const order = await this.orderRepository.findById({ id: orderId });
    if (Statuses.isCompleted(order.status) || Statuses.isFailed(order.status)) {
      throw getError({ message: 'Cannot cancel a completed or failed order' });
    }
    await this.orderRepository.updateById({
      id: orderId,
      data: { status: Statuses.CANCELLED },
    });
  }
}
```

### Validating a status transition

```typescript
import { Statuses } from '@venizia/ignis';

function validateStatusTransition(from: string, to: string) {
  if (!Statuses.isValid(to)) {
    throw getError({ message: `Invalid status: ${to}` });
  }
  if (Statuses.isCompleted(from) || Statuses.isFailed(from)) {
    throw getError({ message: 'Cannot transition from a terminal state' });
  }
  return true;
}
```

## Best practices

- **Use the constants, not magic strings.** `Statuses.COMPLETED`, never `'303_COMPLETED'` - typos in a raw string pass type checking silently.
- **Validate before writing.** Call `Statuses.isValid()` on any status that originates outside the constant catalog (request body, external system) before persisting it.
- **Prefer the `is*` helpers over raw set checks.** `Statuses.isActive(x)` reads better than `Statuses.ACTIVE_SCHEME_SET.has(x)` at call sites, though both are equivalent.
- **Check terminal states before mutating.** `isCompleted()` and `isFailed()` both signal a terminal status - guard state-changing operations against both.

## See also

- [Statuses overview](/references/utilities/statuses) - introduction and common tasks
- [Models](/references/base/models) - entity definitions using statuses
- [Repositories](/references/base/repositories/) - querying and updating by status
- [Filter System](/references/base/filter-system/) - `inq`/`nin` operators for `*_SCHEME_SET`
