export class Statuses {
  static readonly UNKNOWN = '000_UNKNOWN';
  static readonly DRAFT = '100_DRAFT';
  static readonly ACTIVATED = '101_ACTIVATED';
  static readonly DEACTIVATED = '102_DEACTIVATED';
  static readonly BLOCKED = '103_BLOCKED';
  static readonly ARCHIVE = '104_ARCHIVE';
  static readonly SUCCESS = '105_SUCCESS';
  static readonly FAIL = '106_FAIL';
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
  static readonly ARCHIVE = Statuses.ARCHIVE;

  static readonly SCHEME_SET = new Set([
    this.UNKNOWN,
    this.ACTIVATED,
    this.DEACTIVATED,
    this.BLOCKED,
    this.ARCHIVE,
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
