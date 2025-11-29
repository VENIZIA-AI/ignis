import {
  and,
  asc,
  between,
  desc,
  eq,
  getTableColumns,
  gt,
  gte,
  ilike,
  inArray,
  // isNotNull,
  isNull,
  like,
  lt,
  lte,
  ne,
  not,
  notInArray,
  notLike,
  or,
  sql,
  type Column,
  type SQL,
  type Table,
} from 'drizzle-orm';
import { BaseHelper } from '../helpers';
import { DrizzleQueryOptions, TFilter, TWhere } from './common';

const OPS: Record<string, (opts: { column: Column; value: any }) => SQL | undefined> = {
  // Standard Comparison
  eq: opts => eq(opts.column, opts.value),
  neq: opts => ne(opts.column, opts.value),
  gt: opts => gt(opts.column, opts.value),
  gte: opts => gte(opts.column, opts.value),
  lt: opts => lt(opts.column, opts.value),
  lte: opts => lte(opts.column, opts.value),

  // Null Checks
  is: opts => (opts.value === null ? isNull(opts.column) : eq(opts.column, opts.value)),

  // Arrays / Lists
  inq: opts =>
    Array.isArray(opts.value) ? inArray(opts.column, opts.value) : eq(opts.column, opts.value),
  nin: opts =>
    Array.isArray(opts.value) ? notInArray(opts.column, opts.value) : ne(opts.column, opts.value),
  between: opts =>
    Array.isArray(opts.value) && opts.value.length === 2
      ? between(opts.column, opts.value[0], opts.value[1])
      : undefined,

  // Strings
  like: opts => like(opts.column, opts.value),
  nlike: opts => notLike(opts.column, opts.value),
  ilike: opts => ilike(opts.column, opts.value), // Postgres specific (Case insensitive)
  nilike: opts => not(ilike(opts.column, opts.value)),

  // Advanced
  regexp: opts => sql`${opts.column} REGEXP ${opts.value}`, // Dialect specific
};

export class DrizzleFilterBuilder extends BaseHelper {
  constructor() {
    super({ scope: DrizzleFilterBuilder.name });
  }

  /**
   * Main Entry: Convert LB4 Filter -> Drizzle Query Options
   */
  static build(table: Table, filter: TFilter): DrizzleQueryOptions {
    if (!filter) return {};

    // Destructure for cleaner access
    const { limit, skip, order, fields, where, include } = filter;

    // Build the options object dynamically using spread syntax
    // This avoids creating keys with 'undefined' values
    return {
      ...(limit !== undefined && { limit }),
      ...(skip !== undefined && { offset: skip }),
      ...(fields && { columns: fields as Record<string, boolean> }),
      ...(order && { orderBy: this.parseOrder(table, order) }),
      ...(where && { where: this.parseWhere(table, where) }),
      ...(include && { with: this.parseInclude(include) }),
    };
  }

  /**
   * Logic: Recursive Where Clause Builder
   */
  static parseWhere(table: Table, where: TWhere): SQL | undefined {
    const conditions: SQL[] = [];
    const columns = getTableColumns(table);

    for (const [key, value] of Object.entries(where)) {
      if (value === undefined) continue;

      // 1. Handle Logical Groups (AND / OR)
      if (key === 'and' || key === 'or') {
        const clauses = (Array.isArray(value) ? value : [value])
          .map(w => this.parseWhere(table, w))
          .filter((c): c is SQL => !!c); // Remove undefined

        if (clauses.length > 0) {
          conditions.push(key === 'and' ? and(...clauses)! : or(...clauses)!);
        }
        continue;
      }

      // 2. Validate Column Existence
      const column = columns[key];
      if (!column) {
        // Option: Log a warning here if strict mode is desired
        continue;
      }

      // 3. Handle Short Syntax (Implicit EQ, IN, or NULL)
      // Example: { status: 'active' } or { id: [1, 2] }
      if (
        typeof value !== 'object' ||
        value === null ||
        Array.isArray(value) ||
        value instanceof Date
      ) {
        if (value === null) conditions.push(isNull(column));
        else if (Array.isArray(value)) conditions.push(inArray(column, value));
        else conditions.push(eq(column, value));
        continue;
      }

      // 4. Handle Operator Syntax
      // Example: { age: { gt: 10, lte: 20 } }
      for (const [op, opVal] of Object.entries(value)) {
        const operatorFn = OPS[op];
        if (operatorFn) {
          const result = operatorFn({ column, value: opVal });
          if (result) conditions.push(result);
        }
      }
    }

    if (conditions.length === 0) return undefined;
    return conditions.length === 1 ? conditions[0] : and(...conditions);
  }

  /**
   * Logic: Order By
   */
  static parseOrder(table: Table, order: string[]): SQL[] {
    if (!Array.isArray(order)) return [];

    const columns = getTableColumns(table);

    return order.reduce((acc, orderStr) => {
      const parts = orderStr.trim().split(/\s+/); // Handle multiple spaces
      const field = parts[0];
      const dir = parts[1]?.toUpperCase();

      const column = columns[field];
      if (column) {
        acc.push(dir === 'DESC' ? desc(column) : asc(column));
      }
      return acc;
    }, [] as SQL[]);
  }

  /**
   * Logic: Include / Relations
   */
  static parseInclude(include: any[]) {
    return include.reduce(
      (acc, inc) => {
        // String syntax: "posts"
        if (typeof inc === 'string') {
          acc[inc] = true;
          return acc;
        }

        // Object syntax: { relation: "posts", scope: { ... } }
        if (!inc.relation) {
          return acc;
        }

        if (!inc.scope) {
          acc[inc.relation] = true;
          return acc;
        }

        // Note: To strictly type this recursively, we would need the Schema for the related table.
        // Since we don't have it here, we pass 'any' or generic object structure.
        // Recursion works for Limit/Skip/Include, but nested 'Where' might fail
        // if it tries to lookup columns on the wrong table object.
        acc[inc.relation] = this.build({} as Table, inc.scope);
      },
      {} as Record<string, any>,
    );
  }
}
