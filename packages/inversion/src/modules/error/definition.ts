import type { TConstValue } from '@/common/types';

export class ErrorScopes {
  static readonly AUTH = 'auth';
  static readonly VALIDATION = 'validation';
  static readonly BUSINESS = 'business';
  static readonly SYSTEM = 'system';
  static readonly INTEGRATION = 'integration';
}

export type TErrorScope = TConstValue<typeof ErrorScopes>;
