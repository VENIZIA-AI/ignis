import { TConstValue } from '@venizia/ignis-helpers';

/** Default pagination limit for repository queries. */
export const DEFAULT_LIMIT = 10;

/** Defines the operation scope for repository instances (READ_ONLY, WRITE_ONLY, READ_WRITE). */
export class RepositoryOperationScopes {
  static readonly READ_ONLY = 'READ_ONLY';
  static readonly WRITE_ONLY = 'WRITE_ONLY';
  static readonly READ_WRITE = 'READ_WRITE';
  static readonly SCHEME_SET = new Set([this.READ_ONLY, this.WRITE_ONLY, this.READ_WRITE]);

  static isValid(orgType: string): boolean {
    return this.SCHEME_SET.has(orgType);
  }
}

/** Valid repository operation scope values. */
export type TRepositoryOperationScope = TConstValue<typeof RepositoryOperationScopes>;

/** Entity relation types (one-to-one/many-to-one, one-to-many). */
export class RelationTypes {
  static readonly ONE = 'one';
  static readonly MANY = 'many';
  static readonly SCHEME_SET = new Set([this.ONE, this.MANY]);

  static isValid(orgType: string): boolean {
    return this.SCHEME_SET.has(orgType);
  }
}

/** Valid relation type values. */
export type TRelationType = TConstValue<typeof RelationTypes>;

/** PostgreSQL row-level lock strengths for SELECT ... FOR <strength>. */
export class LockStrengths {
  static readonly UPDATE = 'update';
  static readonly NO_KEY_UPDATE = 'no key update';
  static readonly SHARE = 'share';
  static readonly KEY_SHARE = 'key share';
  static readonly SCHEME_SET = new Set([
    this.UPDATE,
    this.NO_KEY_UPDATE,
    this.SHARE,
    this.KEY_SHARE,
  ]);

  static isValid(strength: string): boolean {
    return this.SCHEME_SET.has(strength);
  }
}

/** Valid lock strength values. */
export type TLockStrength = TConstValue<typeof LockStrengths>;
