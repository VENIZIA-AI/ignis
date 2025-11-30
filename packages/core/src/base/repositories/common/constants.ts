import { TConstValue } from '@/common/types';

// --------------------------------------------------------------------------------------
export class RepositoryOperationScopes {
  static readonly READ_ONLY = 'READ_ONLY';
  static readonly WRITE_ONLY = 'WRITE_ONLY';
  static readonly READ_WRITE = 'READ_WRITE';

  static readonly SCHEME_SET = new Set([this.READ_ONLY, this.WRITE_ONLY, this.READ_WRITE]);

  static isValid(orgType: string): boolean {
    return this.SCHEME_SET.has(orgType);
  }
}

export type TRepositoryOperationScope = TConstValue<typeof RepositoryOperationScopes>;
