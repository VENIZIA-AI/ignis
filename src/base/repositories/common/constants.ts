import { TConstValue } from '@/common/types';

// --------------------------------------------------------------------------------------
export class QueryOperators {
  static readonly EQ = 'eq';
  static readonly NE = 'ne';

  static readonly GT = 'gt';
  static readonly GTE = 'gte';

  static readonly LT = 'lt';
  static readonly LTE = 'lte';

  static readonly LIKE = 'like';
  static readonly ILIKE = 'ilike';

  static readonly REGEXP = 'regexp';

  static readonly IN = 'in';
  static readonly NIN = 'nin';

  static readonly EXISTS = 'exists';
  static readonly NOT_EXISTS = 'notExists';

  static readonly BETWEEN = 'between';
  static readonly NOT_BETWEEN = 'notBetween';

  static readonly NOT = 'not';
  static readonly AND = 'and';
  static readonly OR = 'or';

  static readonly SCHEME_SET = new Set([
    this.EQ,
    this.NE,
    this.GT,
    this.GTE,
    this.LT,
    this.LTE,
    this.LIKE,
    this.ILIKE,
    this.REGEXP,
    this.IN,
    this.NIN,
    this.EXISTS,
    this.NOT_EXISTS,
    this.BETWEEN,
    this.NOT_BETWEEN,
    this.NOT,
    this.AND,
    this.OR,
  ]);

  static isValid(orgType: string): boolean {
    return this.SCHEME_SET.has(orgType);
  }
}

export type TQueryOperator = TConstValue<typeof QueryOperators>;

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
