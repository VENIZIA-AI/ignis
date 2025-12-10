import { TConstValue } from '@venizia/ignis-helpers';
import {
  between,
  eq,
  gt,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  like,
  lt,
  lte,
  ne,
  not,
  notInArray,
  notLike,
  sql,
} from 'drizzle-orm';
import { IQueryHandlerOptions } from '../common';

// --------------------------------------------------------------------------------------
export class Sorts {
  static readonly DESC = 'desc';
  static readonly ASC = 'asc';
}

// --------------------------------------------------------------------------------------
export class QueryOperators {
  static readonly EQ = 'eq';
  static readonly NE = 'ne';
  static readonly NEQ = 'neq';

  static readonly GT = 'gt';
  static readonly GTE = 'gte';

  static readonly LT = 'lt';
  static readonly LTE = 'lte';

  static readonly LIKE = 'like';
  static readonly NOT_LIKE = 'nlike';
  static readonly ILIKE = 'ilike';
  static readonly NOT_ILIKE = 'nilike';

  static readonly IS = 'is';
  static readonly IS_NOT = 'isn';
  static readonly REGEXP = 'regexp';

  static readonly IN = 'in';
  static readonly INQ = 'inq';
  static readonly NIN = 'nin';

  static readonly EXISTS = 'exists';
  static readonly NOT_EXISTS = 'notExists';

  static readonly BETWEEN = 'between';
  static readonly NOT_BETWEEN = 'notBetween';

  static readonly NOT = 'not';
  static readonly AND = 'and';
  static readonly OR = 'or';

  static readonly FNS = {
    // Standard Comparison
    [this.EQ]: (opts: IQueryHandlerOptions) =>
      opts.value === null ? isNull(opts.column) : eq(opts.column, opts.value),
    [this.NE]: (opts: IQueryHandlerOptions) =>
      opts.value === null ? isNotNull(opts.column) : ne(opts.column, opts.value),
    [this.NEQ]: (opts: IQueryHandlerOptions) =>
      opts.value === null ? isNotNull(opts.column) : ne(opts.column, opts.value),

    [this.GT]: (opts: IQueryHandlerOptions) => gt(opts.column, opts.value),
    [this.GTE]: (opts: IQueryHandlerOptions) => gte(opts.column, opts.value),

    [this.LT]: (opts: IQueryHandlerOptions) => lt(opts.column, opts.value),
    [this.LTE]: (opts: IQueryHandlerOptions) => lte(opts.column, opts.value),

    // Null Checks
    [this.IS]: (opts: IQueryHandlerOptions) =>
      opts.value === null ? isNull(opts.column) : eq(opts.column, opts.value),
    [this.IS_NOT]: (opts: IQueryHandlerOptions) =>
      opts.value === null ? isNotNull(opts.column) : ne(opts.column, opts.value),

    // Arrays / Lists
    [this.IN]: (opts: IQueryHandlerOptions) =>
      Array.isArray(opts.value) ? inArray(opts.column, opts.value) : eq(opts.column, opts.value),
    [this.INQ]: (opts: IQueryHandlerOptions) =>
      Array.isArray(opts.value) ? inArray(opts.column, opts.value) : eq(opts.column, opts.value),
    [this.NIN]: (opts: IQueryHandlerOptions) =>
      Array.isArray(opts.value) ? notInArray(opts.column, opts.value) : ne(opts.column, opts.value),
    [this.BETWEEN]: (opts: IQueryHandlerOptions) =>
      Array.isArray(opts.value) && opts.value.length === 2
        ? between(opts.column, opts.value[0], opts.value[1])
        : undefined,

    // Strings
    [this.LIKE]: (opts: IQueryHandlerOptions) => like(opts.column, opts.value),
    [this.NOT_LIKE]: (opts: IQueryHandlerOptions) => notLike(opts.column, opts.value),
    [this.ILIKE]: (opts: IQueryHandlerOptions) => ilike(opts.column, opts.value), // Postgres specific (Case insensitive)
    [this.NOT_ILIKE]: (opts: IQueryHandlerOptions) => not(ilike(opts.column, opts.value)),

    // Advanced
    [this.REGEXP]: (opts: IQueryHandlerOptions) => sql`${opts.column} REGEXP ${opts.value}`, // Dialect specific
  };

  static readonly SCHEME_SET = new Set([
    this.EQ,
    this.NE,
    this.NEQ,
    this.GT,
    this.GTE,
    this.LT,
    this.LTE,
    this.LIKE,
    this.NOT_LIKE,
    this.ILIKE,
    this.NOT_ILIKE,
    this.IS,
    this.IS_NOT,
    this.REGEXP,
    this.IN,
    this.INQ,
    this.NIN,
    this.EXISTS,
    this.NOT_EXISTS,
    this.BETWEEN,
    this.NOT_BETWEEN,
    this.NOT,
    this.AND,
    this.OR,
  ]);

  static readonly LOGICAL_GROUP_OPERATORS = new Set([this.AND, this.OR]);

  static isValid(orgType: string): boolean {
    return this.SCHEME_SET.has(orgType);
  }
}

export type TQueryOperator = TConstValue<typeof QueryOperators>;
