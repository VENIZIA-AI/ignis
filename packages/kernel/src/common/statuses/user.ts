import { CommonStatuses } from './common';

/** User statuses. */
export class UserStatuses extends CommonStatuses {}

/** User types within the application. */
export class UserTypes {
  static readonly SYSTEM = 'SYSTEM';
  static readonly LINKED = 'LINKED';

  static readonly SCHEME_SET = new Set([this.SYSTEM, this.LINKED]);

  static isValid(orgType: string): boolean {
    return this.SCHEME_SET.has(orgType);
  }
}
