import { Statuses } from './common';

/** Database migration statuses. */
export class MigrationStatuses {
  static readonly UNKNOWN = Statuses.UNKNOWN;
  static readonly SUCCESS = Statuses.SUCCESS;
  static readonly FAIL = Statuses.FAIL;

  static readonly SCHEME_SET = new Set([this.UNKNOWN, this.SUCCESS, this.FAIL]);

  static isValid(scheme: string): boolean {
    return this.SCHEME_SET.has(scheme);
  }
}
