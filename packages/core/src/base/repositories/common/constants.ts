import { TConstValue } from '@vez/ignis-helpers';

export const DEFAULT_LIMIT = 10;

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

// --------------------------------------------------------------------------------------
export class RelationTypes {
  static readonly ONE = 'one';
  static readonly MANY = 'many';

  static readonly SCHEME_SET = new Set([this.ONE, this.MANY]);

  static isValid(orgType: string): boolean {
    return this.SCHEME_SET.has(orgType);
  }
}

export type TRelationType = TConstValue<typeof RelationTypes>;
