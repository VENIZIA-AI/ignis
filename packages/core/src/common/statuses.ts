export class Statuses {
  // 0xx - Initial
  static readonly UNKNOWN = '000_UNKNOWN';
  static readonly DRAFT = '001_DRAFT';

  // 1xx - Pending/Waiting
  static readonly NEW = '100_NEW';
  static readonly QUEUED = '101_QUEUED';
  static readonly SCHEDULED = '102_SCHEDULED';
  static readonly PENDING = '103_PENDING';
  static readonly IN_REVIEW = '104_IN_REVIEW';
  static readonly APPROVED = '105_APPROVED';

  // 2xx - Active/Running
  static readonly ENABLED = '200_ENABLED';
  static readonly ACTIVATED = '201_ACTIVATED';
  static readonly RUNNING = '202_RUNNING';
  static readonly PROCESSING = '203_PROCESSING';
  static readonly PAUSED = '204_PAUSED';

  // 3xx - Completed (positive terminal)
  static readonly COMPLETED = '300_COMPLETED';
  static readonly SUCCESS = '301_SUCCESS';
  static readonly PARTIAL = '302_PARTIAL';

  // 4xx - Inactive (negative terminal, reversible)
  static readonly DISABLED = '400_DISABLED';
  static readonly DEACTIVATED = '401_DEACTIVATED';
  static readonly SUSPENDED = '402_SUSPENDED';
  static readonly BLOCKED = '403_BLOCKED';
  static readonly CLOSED = '404_CLOSED';
  static readonly ARCHIVED = '405_ARCHIVED';
  static readonly REJECTED = '406_REJECTED';
  static readonly REVOKED = '407_REVOKED';

  // 5xx - Failed/Error (negative terminal, final)
  static readonly FAIL = '500_FAIL';
  static readonly EXPIRED = '501_EXPIRED';
  static readonly TIMEOUT = '502_TIMEOUT';
  static readonly SKIPPED = '503_SKIPPED';
  static readonly ABORTED = '504_ABORTED';
  static readonly CANCELLED = '505_CANCELLED';
  static readonly DELETED = '506_DELETED';
}

export class MigrationStatuses {
  static readonly UNKNOWN = Statuses.UNKNOWN;
  static readonly SUCCESS = Statuses.SUCCESS;
  static readonly FAIL = Statuses.FAIL;
}

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

export class UserStatuses extends CommonStatuses {}

export class RoleStatuses extends CommonStatuses {}

export class UserTypes {
  static readonly SYSTEM = 'SYSTEM';
  static readonly LINKED = 'LINKED';

  static readonly SCHEME_SET = new Set([this.SYSTEM, this.LINKED]);

  static isValid(orgType: string): boolean {
    return this.SCHEME_SET.has(orgType);
  }
}
