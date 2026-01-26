// -----------------------------------------------------------------------------
/**
 * Defines a comprehensive set of application statuses, categorized into different schemes.
 * Provides utility methods to check the status against these schemes.
 */
export class Statuses {
  // 0xx - Initial
  static readonly UNKNOWN = '000_UNKNOWN';
  static readonly DRAFT = '001_DRAFT';

  // 1xx - Pending/Waiting (awaiting action/decision)
  static readonly NEW = '100_NEW';
  static readonly QUEUED = '101_QUEUED';
  static readonly SCHEDULED = '102_SCHEDULED';
  static readonly PENDING = '103_PENDING';
  static readonly IN_REVIEW = '104_IN_REVIEW';

  // 2xx - Active/Running (in progress)
  static readonly ENABLED = '200_ENABLED';
  static readonly ACTIVATED = '201_ACTIVATED';
  static readonly RUNNING = '202_RUNNING';
  static readonly PROCESSING = '203_PROCESSING';
  static readonly SENT = '204_SENT';
  static readonly RECEIVED = '205_RECEIVED';

  // 3xx - Completed (positive terminal)
  static readonly PARTIAL = '300_PARTIAL';
  static readonly APPROVED = '301_APPROVED';
  static readonly SUCCESS = '302_SUCCESS';
  static readonly COMPLETED = '303_COMPLETED';
  static readonly SETTLED = '304_SETTLED';
  static readonly CONFIRMED = '305_CONFIRMED';

  // 4xx - Inactive (negative, reversible)
  static readonly DISABLED = '400_DISABLED';
  static readonly DEACTIVATED = '401_DEACTIVATED';
  static readonly SUSPENDED = '402_SUSPENDED';
  static readonly BLOCKED = '403_BLOCKED';
  static readonly CLOSED = '404_CLOSED';
  static readonly ARCHIVED = '405_ARCHIVED';
  static readonly PAUSED = '406_PAUSED';
  static readonly REVOKED = '407_REVOKED';
  static readonly REFUNDED = '408_REFUNDED';

  // 5xx - Failed/Error (negative terminal, final)
  static readonly FAIL = '500_FAIL';
  static readonly EXPIRED = '501_EXPIRED';
  static readonly TIMEOUT = '502_TIMEOUT';
  static readonly SKIPPED = '503_SKIPPED';
  static readonly ABORTED = '504_ABORTED';
  static readonly CANCELLED = '505_CANCELLED';
  static readonly DELETED = '506_DELETED';
  static readonly REJECTED = '507_REJECTED';

  // Scheme sets by group
  static readonly INITIAL_SCHEME_SET = new Set([this.UNKNOWN, this.DRAFT]);

  static readonly PENDING_SCHEME_SET = new Set([
    this.NEW,
    this.QUEUED,
    this.SCHEDULED,
    this.PENDING,
    this.IN_REVIEW,
  ]);

  static readonly ACTIVE_SCHEME_SET = new Set([
    this.ENABLED,
    this.ACTIVATED,
    this.RUNNING,
    this.PROCESSING,
    this.SENT,
    this.RECEIVED,
  ]);

  static readonly COMPLETED_SCHEME_SET = new Set([
    this.COMPLETED,
    this.SUCCESS,
    this.PARTIAL,
    this.SETTLED,
    this.APPROVED,
    this.CONFIRMED,
  ]);

  static readonly INACTIVE_SCHEME_SET = new Set([
    this.DISABLED,
    this.DEACTIVATED,
    this.SUSPENDED,
    this.BLOCKED,
    this.CLOSED,
    this.ARCHIVED,
    this.PAUSED,
    this.REVOKED,
    this.REFUNDED,
  ]);

  static readonly FAILED_SCHEME_SET = new Set([
    this.FAIL,
    this.EXPIRED,
    this.TIMEOUT,
    this.SKIPPED,
    this.ABORTED,
    this.CANCELLED,
    this.DELETED,
    this.REJECTED,
  ]);

  static readonly SCHEME_SET = new Set([
    ...this.INITIAL_SCHEME_SET,
    ...this.PENDING_SCHEME_SET,
    ...this.ACTIVE_SCHEME_SET,
    ...this.COMPLETED_SCHEME_SET,
    ...this.INACTIVE_SCHEME_SET,
    ...this.FAILED_SCHEME_SET,
  ]);

  // Validation methods
  static isInitial(status: string): boolean {
    return this.INITIAL_SCHEME_SET.has(status);
  }

  static isPending(status: string): boolean {
    return this.PENDING_SCHEME_SET.has(status);
  }

  static isActive(status: string): boolean {
    return this.ACTIVE_SCHEME_SET.has(status);
  }

  static isCompleted(status: string): boolean {
    return this.COMPLETED_SCHEME_SET.has(status);
  }

  static isInactive(status: string): boolean {
    return this.INACTIVE_SCHEME_SET.has(status);
  }

  static isFailed(status: string): boolean {
    return this.FAILED_SCHEME_SET.has(status);
  }

  static isValid(status: string): boolean {
    return this.SCHEME_SET.has(status);
  }
}

// -----------------------------------------------------------------------------
/**
 * Defines statuses specifically for database migrations.
 */
export class MigrationStatuses {
  static readonly UNKNOWN = Statuses.UNKNOWN;
  static readonly SUCCESS = Statuses.SUCCESS;
  static readonly FAIL = Statuses.FAIL;

  static readonly SCHEME_SET = new Set([this.UNKNOWN, this.SUCCESS, this.FAIL]);

  static isValid(scheme: string): boolean {
    return this.SCHEME_SET.has(scheme);
  }
}

// -----------------------------------------------------------------------------
/**
 * Defines a common set of statuses that can be reused across different entities.
 */
export class CommonStatuses {
  static readonly UNKNOWN = Statuses.UNKNOWN;
  static readonly ACTIVATED = Statuses.ACTIVATED;
  static readonly DEACTIVATED = Statuses.DEACTIVATED;
  static readonly BLOCKED = Statuses.BLOCKED;
  static readonly ARCHIVED = Statuses.ARCHIVED;

  static readonly SCHEME_SET = new Set([
    this.UNKNOWN,
    this.ACTIVATED,
    this.DEACTIVATED,
    this.BLOCKED,
    this.ARCHIVED,
  ]);

  static isValid(scheme: string): boolean {
    return this.SCHEME_SET.has(scheme);
  }
}

// -----------------------------------------------------------------------------
/**
 * Defines statuses specific to users, inheriting from `CommonStatuses`.
 */
export class UserStatuses extends CommonStatuses {}

// -----------------------------------------------------------------------------
/**
 * Defines statuses specific to roles, inheriting from `CommonStatuses`.
 */
export class RoleStatuses extends CommonStatuses {}

// -----------------------------------------------------------------------------
/**
 * Defines different types of users within the application.
 */
export class UserTypes {
  static readonly SYSTEM = 'SYSTEM';
  static readonly LINKED = 'LINKED';

  static readonly SCHEME_SET = new Set([this.SYSTEM, this.LINKED]);

  static isValid(orgType: string): boolean {
    return this.SCHEME_SET.has(orgType);
  }
}
