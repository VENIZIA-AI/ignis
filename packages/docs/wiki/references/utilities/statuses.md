---
title: Status Codes & Constants Reference
description: Technical reference for IGNIS status codes, bindings, and constants
difficulty: beginner
lastUpdated: 2026-01-03
---

# Status Codes & Constants Reference

IGNIS provides a comprehensive system of standardized status codes and constants to maintain consistency across your application. This reference covers the `Statuses` class and related utilities for managing entity states.

**Files:**
- `packages/core/src/common/statuses.ts`
- `packages/core/src/common/bindings.ts`

## Quick Reference

| Class | Purpose | Use Case |
|-------|---------|----------|
| `Statuses` | Universal status codes (0xx-5xx scheme) | General entity lifecycle states |
| `MigrationStatuses` | Database migration status tracking | Migration success/failure tracking |
| `CommonStatuses` | Common entity statuses | Users, roles, and general entities |
| `UserStatuses` | User-specific statuses | User account states |
| `RoleStatuses` | Role-specific statuses | Role lifecycle states |
| `UserTypes` | User type classification | System vs linked users |

## Table of Contents

- [Statuses Class](#statuses-class)
  - [Status Code Scheme](#status-code-scheme)
  - [Status Groups](#status-groups)
  - [Validation Methods](#validation-methods)
- [Specialized Status Classes](#specialized-status-classes)
- [Usage Examples](#usage-examples)
- [Binding Namespaces](#binding-namespaces)
- [Best Practices](#best-practices)
- [See Also](#see-also)

## Statuses Class

The `Statuses` class provides a comprehensive, HTTP-inspired status code system for tracking entity lifecycle states.

### Status Code Scheme

Status codes follow a numerical prefix pattern inspired by HTTP status codes:

| Prefix | Category | Meaning | Reversibility |
|--------|----------|---------|---------------|
| **0xx** | Initial | Entity creation/draft state | N/A |
| **1xx** | Pending | Awaiting action or decision | Reversible |
| **2xx** | Active | In progress or running | Reversible |
| **3xx** | Completed | Positive terminal state | Terminal |
| **4xx** | Inactive | Negative but reversible | Reversible |
| **5xx** | Failed | Negative terminal state | Terminal |

### 0xx - Initial States

Initial states for entities being created or in draft mode.

| Constant | Value | Description |
|----------|-------|-------------|
| `UNKNOWN` | `'000_UNKNOWN'` | Unknown or uninitialized state |
| `DRAFT` | `'001_DRAFT'` | Draft state, not yet finalized |

**Example Usage:**
```typescript
import { Statuses } from '@venizia/ignis';

const article = await articleRepository.create({
  title: 'My Article',
  status: Statuses.DRAFT, // Still being written
});
```

### 1xx - Pending/Waiting States

States indicating the entity is awaiting action, approval, or processing.

| Constant | Value | Description |
|----------|-------|-------------|
| `NEW` | `'100_NEW'` | Newly created, not yet processed |
| `QUEUED` | `'101_QUEUED'` | Queued for processing |
| `SCHEDULED` | `'102_SCHEDULED'` | Scheduled for future execution |
| `PENDING` | `'103_PENDING'` | Awaiting action or decision |
| `IN_REVIEW` | `'104_IN_REVIEW'` | Under review or approval process |

**Example Usage:**
```typescript
// Job queue
const job = await jobRepository.create({
  name: 'send-email',
  status: Statuses.QUEUED,
});

// Approval workflow
const post = await postRepository.update(postId, {
  status: Statuses.IN_REVIEW, // Submitted for moderation
});
```

### 2xx - Active/Running States

States indicating the entity is actively being processed or is currently operational.

| Constant | Value | Description |
|----------|-------|-------------|
| `ENABLED` | `'200_ENABLED'` | Feature or entity is enabled |
| `ACTIVATED` | `'201_ACTIVATED'` | Account or service is active |
| `RUNNING` | `'202_RUNNING'` | Process is currently running |
| `PROCESSING` | `'203_PROCESSING'` | Being actively processed |
| `SENT` | `'204_SENT'` | Message/item has been sent |
| `RECEIVED` | `'205_RECEIVED'` | Message/item has been received |

**Example Usage:**
```typescript
// User account activation
await userRepository.update(userId, {
  status: Statuses.ACTIVATED,
});

// Background job
await jobRepository.update(jobId, {
  status: Statuses.RUNNING,
  startedAt: new Date(),
});

// Email tracking
await emailRepository.create({
  to: 'user@example.com',
  subject: 'Welcome',
  status: Statuses.SENT,
});
```

### 3xx - Completed States

Positive terminal states indicating successful completion.

| Constant | Value | Description |
|----------|-------|-------------|
| `PARTIAL` | `'300_PARTIAL'` | Partially completed |
| `APPROVED` | `'301_APPROVED'` | Approved by reviewer |
| `SUCCESS` | `'302_SUCCESS'` | Successfully completed |
| `COMPLETED` | `'303_COMPLETED'` | Fully completed |
| `SETTLED` | `'304_SETTLED'` | Finalized or settled |
| `CONFIRMED` | `'305_CONFIRMED'` | Confirmed by user or system |

**Example Usage:**
```typescript
// Job completion
await jobRepository.update(jobId, {
  status: Statuses.SUCCESS,
  completedAt: new Date(),
});

// Approval workflow
await documentRepository.update(docId, {
  status: Statuses.APPROVED,
  approvedBy: userId,
  approvedAt: new Date(),
});

// Batch processing
await batchRepository.update(batchId, {
  status: Statuses.PARTIAL, // Some items succeeded
  processedCount: 75,
  totalCount: 100,
});
```

### 4xx - Inactive States

Negative but reversible states - the entity can be reactivated.

| Constant | Value | Description |
|----------|-------|-------------|
| `DISABLED` | `'400_DISABLED'` | Feature or entity is disabled |
| `DEACTIVATED` | `'401_DEACTIVATED'` | Account or service is deactivated |
| `SUSPENDED` | `'402_SUSPENDED'` | Temporarily suspended |
| `BLOCKED` | `'403_BLOCKED'` | Access blocked (e.g., banned user) |
| `CLOSED` | `'404_CLOSED'` | Closed but can be reopened |
| `ARCHIVED` | `'405_ARCHIVED'` | Archived for record keeping |
| `PAUSED` | `'406_PAUSED'` | Paused, can be resumed |
| `REVOKED` | `'407_REVOKED'` | Permission or access revoked |
| `REFUNDED` | `'408_REFUNDED'` | Payment or transaction refunded |

**Example Usage:**
```typescript
// User account management
await userRepository.update(userId, {
  status: Statuses.SUSPENDED, // Temporarily suspended
  suspendedUntil: addDays(new Date(), 7),
});

// Feature flags
await featureRepository.update(featureId, {
  status: Statuses.DISABLED, // Feature turned off
});

// Ticket system
await ticketRepository.update(ticketId, {
  status: Statuses.CLOSED, // Can be reopened if needed
});
```

### 5xx - Failed/Error States

Negative terminal states indicating permanent failure or cancellation.

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

**Example Usage:**
```typescript
// Job failure
await jobRepository.update(jobId, {
  status: Statuses.FAIL,
  error: 'Connection timeout',
  failedAt: new Date(),
});

// Token expiration
await tokenRepository.update(tokenId, {
  status: Statuses.EXPIRED,
  expiredAt: new Date(),
});

// Soft delete
await productRepository.update(productId, {
  status: Statuses.DELETED,
  deletedAt: new Date(),
  deletedBy: userId,
});
```

---

## Status Groups

The `Statuses` class provides static sets for grouping related statuses.

### Available Groups

| Group | Set Name | Included Statuses |
|-------|----------|-------------------|
| Initial | `INITIAL_SCHEME_SET` | `UNKNOWN`, `DRAFT` |
| Pending | `PENDING_SCHEME_SET` | `NEW`, `QUEUED`, `SCHEDULED`, `PENDING`, `IN_REVIEW` |
| Active | `ACTIVE_SCHEME_SET` | `ENABLED`, `ACTIVATED`, `RUNNING`, `PROCESSING`, `SENT`, `RECEIVED` |
| Completed | `COMPLETED_SCHEME_SET` | `PARTIAL`, `APPROVED`, `SUCCESS`, `COMPLETED`, `SETTLED`, `CONFIRMED` |
| Inactive | `INACTIVE_SCHEME_SET` | `DISABLED`, `DEACTIVATED`, `SUSPENDED`, `BLOCKED`, `CLOSED`, `ARCHIVED`, `PAUSED`, `REVOKED`, `REFUNDED` |
| Failed | `FAILED_SCHEME_SET` | `FAIL`, `EXPIRED`, `TIMEOUT`, `SKIPPED`, `ABORTED`, `CANCELLED`, `DELETED`, `REJECTED` |
| All | `SCHEME_SET` | All statuses combined |

### Usage

```typescript
import { Statuses } from '@venizia/ignis';

// Check if status is in a group
if (Statuses.ACTIVE_SCHEME_SET.has(order.status)) {
  console.log('Order is being processed');
}

// Filter active jobs
const activeJobs = jobs.filter(job =>
  Statuses.ACTIVE_SCHEME_SET.has(job.status)
);

// Check if operation can proceed
const canRetry = !Statuses.FAILED_SCHEME_SET.has(task.status);
```

---

## Validation Methods

The `Statuses` class provides helper methods for checking status categories.

### Available Methods

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `isInitial(status)` | `status: string` | `boolean` | Check if status is in initial group |
| `isPending(status)` | `status: string` | `boolean` | Check if status is in pending group |
| `isActive(status)` | `status: string` | `boolean` | Check if status is in active group |
| `isCompleted(status)` | `status: string` | `boolean` | Check if status is in completed group |
| `isInactive(status)` | `status: string` | `boolean` | Check if status is in inactive group |
| `isFailed(status)` | `status: string` | `boolean` | Check if status is in failed group |
| `isValid(status)` | `status: string` | `boolean` | Check if status is a valid status code |

### Examples

```typescript
import { Statuses } from '@venizia/ignis';

// Conditional logic based on status
if (Statuses.isActive(user.status)) {
  // User can log in
  await processLogin(user);
} else if (Statuses.isInactive(user.status)) {
  throw new Error('Account is inactive. Please contact support.');
} else if (Statuses.isFailed(user.status)) {
  throw new Error('Account has been permanently closed.');
}

// Validation
function validateStatusTransition(from: string, to: string) {
  if (!Statuses.isValid(to)) {
    throw new Error(`Invalid status: ${to}`);
  }

  // Don't allow transitions from terminal states
  if (Statuses.isCompleted(from) || Statuses.isFailed(from)) {
    throw new Error('Cannot transition from terminal state');
  }

  return true;
}

// Filter entities
const activeUsers = users.filter(user => Statuses.isActive(user.status));
const pendingOrders = orders.filter(order => Statuses.isPending(order.status));
```

---

## Specialized Status Classes

### MigrationStatuses

Simplified statuses for database migration tracking.

```typescript
import { MigrationStatuses } from '@venizia/ignis';

class MigrationStatuses {
  static readonly UNKNOWN = '000_UNKNOWN';
  static readonly SUCCESS = '302_SUCCESS';
  static readonly FAIL = '500_FAIL';

  static readonly SCHEME_SET = new Set([
    this.UNKNOWN,
    this.SUCCESS,
    this.FAIL,
  ]);

  static isValid(scheme: string): boolean;
}
```

**Usage:**
```typescript
await migrationRepository.create({
  version: '20240103_001',
  name: 'add_users_table',
  status: MigrationStatuses.SUCCESS,
  appliedAt: new Date(),
});
```

### CommonStatuses

Common statuses used across multiple entity types.

```typescript
import { CommonStatuses } from '@venizia/ignis';

class CommonStatuses {
  static readonly UNKNOWN = '000_UNKNOWN';
  static readonly ACTIVATED = '201_ACTIVATED';
  static readonly DEACTIVATED = '401_DEACTIVATED';
  static readonly BLOCKED = '403_BLOCKED';
  static readonly ARCHIVED = '405_ARCHIVED';

  static readonly SCHEME_SET = new Set([...]);
  static isValid(scheme: string): boolean;
}
```

**Usage:**
```typescript
// User management
await userRepository.update(userId, {
  status: CommonStatuses.ACTIVATED,
});

// Role management
await roleRepository.update(roleId, {
  status: CommonStatuses.ARCHIVED,
});
```

### UserStatuses & RoleStatuses

Aliases for `CommonStatuses` with semantic naming.

```typescript
import { UserStatuses, RoleStatuses } from '@venizia/ignis';

// UserStatuses extends CommonStatuses
const user = await userRepository.create({
  email: 'user@example.com',
  status: UserStatuses.ACTIVATED,
});

// RoleStatuses extends CommonStatuses
const role = await roleRepository.create({
  name: 'admin',
  status: RoleStatuses.ACTIVATED,
});
```

### UserTypes

Classification of user types in the system.

```typescript
import { UserTypes } from '@venizia/ignis';

class UserTypes {
  static readonly SYSTEM = 'SYSTEM';   // System-generated users
  static readonly LINKED = 'LINKED';   // External auth (OAuth, SAML)

  static readonly SCHEME_SET = new Set([this.SYSTEM, this.LINKED]);
  static isValid(orgType: string): boolean;
}
```

**Usage:**
```typescript
// Create system user
const systemUser = await userRepository.create({
  email: 'system@app.com',
  type: UserTypes.SYSTEM,
  status: UserStatuses.ACTIVATED,
});

// OAuth linked user
const oauthUser = await userRepository.create({
  email: 'user@example.com',
  type: UserTypes.LINKED,
  linkedProvider: 'google',
  status: UserStatuses.ACTIVATED,
});
```

---

## Usage Examples

### Entity Lifecycle Management

```typescript
import { Statuses } from '@venizia/ignis';

class OrderService extends BaseService {
  async createOrder(data: CreateOrderDto) {
    // Start as NEW
    const order = await this.orderRepository.create({
      ...data,
      status: Statuses.NEW,
    });

    // Queue for processing
    await this.orderRepository.update(order.id, {
      status: Statuses.QUEUED,
    });

    return order;
  }

  async processOrder(orderId: string) {
    // Mark as processing
    await this.orderRepository.update(orderId, {
      status: Statuses.PROCESSING,
      startedAt: new Date(),
    });

    try {
      // Process order logic...
      await this.paymentService.charge(order);
      await this.inventoryService.reserve(order.items);

      // Mark as completed
      await this.orderRepository.update(orderId, {
        status: Statuses.COMPLETED,
        completedAt: new Date(),
      });
    } catch (error) {
      // Mark as failed
      await this.orderRepository.update(orderId, {
        status: Statuses.FAIL,
        error: error.message,
        failedAt: new Date(),
      });

      throw error;
    }
  }

  async cancelOrder(orderId: string) {
    const order = await this.orderRepository.findById(orderId);

    // Can only cancel pending or active orders
    if (Statuses.isCompleted(order.status) || Statuses.isFailed(order.status)) {
      throw new Error('Cannot cancel completed or failed order');
    }

    await this.orderRepository.update(orderId, {
      status: Statuses.CANCELLED,
      cancelledAt: new Date(),
    });
  }
}
```

### Status-Based Queries

```typescript
import { Statuses } from '@venizia/ignis';

class JobService extends BaseService {
  // Get all jobs that can be retried
  async getRetryableJobs() {
    return this.jobRepository.find({
      where: {
        status: { in: [...Statuses.FAILED_SCHEME_SET] },
        retryCount: { lt: 3 },
      },
    });
  }

  // Get active jobs count
  async getActiveJobsCount() {
    return this.jobRepository.count({
      where: {
        status: { in: [...Statuses.ACTIVE_SCHEME_SET] },
      },
    });
  }

  // Archive old completed jobs
  async archiveCompletedJobs(daysOld: number) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    return this.jobRepository.updateMany({
      where: {
        status: { in: [...Statuses.COMPLETED_SCHEME_SET] },
        completedAt: { lt: cutoffDate },
      },
      data: {
        status: Statuses.ARCHIVED,
      },
    });
  }
}
```

### Validation & State Transitions

```typescript
import { Statuses } from '@venizia/ignis';

class TaskService extends BaseService {
  async updateTaskStatus(taskId: string, newStatus: string) {
    // Validate status
    if (!Statuses.isValid(newStatus)) {
      throw new Error(`Invalid status: ${newStatus}`);
    }

    const task = await this.taskRepository.findById(taskId);

    // Validate transition
    this.validateStatusTransition(task.status, newStatus);

    await this.taskRepository.update(taskId, {
      status: newStatus,
      statusChangedAt: new Date(),
    });
  }

  private validateStatusTransition(from: string, to: string) {
    // Cannot transition from terminal states
    if (Statuses.isCompleted(from) || Statuses.isFailed(from)) {
      throw new Error('Cannot change status from terminal state');
    }

    // Can only move to COMPLETED from ACTIVE or PENDING
    if (to === Statuses.COMPLETED) {
      if (!Statuses.isActive(from) && !Statuses.isPending(from)) {
        throw new Error('Can only complete active or pending tasks');
      }
    }

    // Additional transition rules...
  }
}
```

---

## Binding Namespaces

The `BindingNamespaces` class organizes dependency injection bindings by type.

**File:** `packages/core/src/common/bindings.ts`

### Available Namespaces

```typescript
import { BindingNamespaces } from '@venizia/ignis';

class BindingNamespaces {
  static readonly COMPONENT = 'components';
  static readonly DATASOURCE = 'datasources';
  static readonly REPOSITORY = 'repositories';
  static readonly MODEL = 'models';
  static readonly SERVICE = 'services';
  static readonly MIDDLEWARE = 'middlewares';
  static readonly PROVIDER = 'providers';
  static readonly CONTROLLER = 'controllers';
  static readonly BOOTERS = 'booters';
}
```

### CoreBindings

Application-level binding keys:

```typescript
import { CoreBindings } from '@venizia/ignis';

class CoreBindings {
  static readonly APPLICATION_INSTANCE = '@app/instance';
  static readonly APPLICATION_SERVER = '@app/server';
  static readonly APPLICATION_CONFIG = '@app/config';
  static readonly APPLICATION_PROJECT_ROOT = '@app/project_root';
  static readonly APPLICATION_ROOT_ROUTER = '@app/router/root';
  static readonly APPLICATION_ENVIRONMENTS = '@app/environments';
  static readonly APPLICATION_MIDDLEWARE_OPTIONS = '@app/middleware_options';
}
```

**Usage:**
```typescript
// Access application instance
const app = container.get(CoreBindings.APPLICATION_INSTANCE);

// Access configuration
const config = container.get(CoreBindings.APPLICATION_CONFIG);
```

---

## Best Practices

### 1. Use Status Constants

```typescript
// ✅ Good: Use constants
order.status = Statuses.COMPLETED;

// ❌ Bad: Magic strings
order.status = '303_COMPLETED'; // Prone to typos
```

### 2. Validate Before Updating

```typescript
// ✅ Good: Validate transitions
if (Statuses.isCompleted(order.status)) {
  throw new Error('Cannot modify completed order');
}

// ❌ Bad: No validation
order.status = newStatus; // Could break business rules
```

### 3. Use Helper Methods

```typescript
// ✅ Good: Use helper methods
if (Statuses.isActive(job.status)) {
  // ...
}

// ❌ Bad: Manual set checking
if (Statuses.ACTIVE_SCHEME_SET.has(job.status)) {
  // Less readable
}
```

### 4. Document State Machines

```typescript
/**
 * Order Status Flow:
 * NEW → QUEUED → PROCESSING → COMPLETED
 *   ↓      ↓          ↓
 * CANCELLED ← ← ← ← ← ←
 */
class OrderService {
  // Implementation...
}
```

### 5. Terminal State Checks

```typescript
// ✅ Good: Check for terminal states
const isTerminal = Statuses.isCompleted(status) || Statuses.isFailed(status);

if (isTerminal) {
  throw new Error('Cannot modify entity in terminal state');
}
```

---

## See Also

- **Related References:**
  - [Models](../base/models.md) - Entity definitions using statuses
  - [Repositories](../base/repositories/) - Querying by status
  - [Services](../base/services.md) - Business logic with status transitions

- **Guides:**
  - [Data Modeling](/guides/core-concepts/persistent/models)
  - [Working with Repositories](/guides/core-concepts/persistent/repositories)

- **Best Practices:**
  - [Architectural Patterns](/best-practices/architectural-patterns)
  - [Data Modeling Best Practices](/best-practices/data-modeling)
