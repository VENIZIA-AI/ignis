import type { TConstValue } from '@/common/types';

/** Categories an error definition can belong to, set in `TErrorDefinition.category`. */
export class ErrorScopes {
  static readonly AUTH = 'auth';
  static readonly VALIDATION = 'validation';
  static readonly BUSINESS = 'business';
  static readonly SYSTEM = 'system';
  static readonly INTEGRATION = 'integration';
}

/** One of the `ErrorScopes` values. */
export type TErrorScope = TConstValue<typeof ErrorScopes>;
