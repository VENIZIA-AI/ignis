import { CommonStatuses } from './common';
import { ConstClass } from '@venizia/ignis-helpers/common';

/** User statuses. */
export class UserStatuses extends CommonStatuses {}

/** User types within the application. */
export class UserTypes extends ConstClass {
  static readonly SYSTEM = 'SYSTEM';
  static readonly LINKED = 'LINKED';
}
