import { TTableObject, TTableSchemaWithId } from '@/base/models';
import { BaseHelper, getError } from '@venizia/ignis-helpers';
import {
  and,
  asc,
  desc,
  eq,
  getTableColumns,
  inArray,
  isNull,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import isEmpty from 'lodash/isEmpty';
import { TDrizzleQueryOptions, TFilter, TInclusion, TRelationConfig, TWhere } from '../common';
import { QueryOperators, Sorts } from './query';

export class DrizzleFilterBuilder extends BaseHelper {
  constructor() {
    super({ scope: DrizzleFilterBuilder.name });
  }

  build<Schema extends TTableSchemaWithId>(opts: {
    tableName: string;
    schema: Schema;
    relations: { [relationName: string]: TRelationConfig };
    filter: TFilter<TTableObject<Schema>>;
  }): TDrizzleQueryOptions {
    if (!opts.filter) {
      return {};
    }

    const { tableName, schema, relations, filter } = opts;
    const { limit, skip, order, fields, where, include } = filter;
    const rs = {
      ...(limit !== undefined && { limit }),
      ...(skip !== undefined && { offset: skip }),
      ...(fields && { columns: this.toColumns(fields) }),
      ...(order && { orderBy: this.toOrderBy({ tableName, schema, order }) }),
      ...(where && { where: this.toWhere({ tableName, schema, where }) }),
      ...(include && { with: this.toInclude({ include, relations }) }),
    };

    return rs;
  }

  toColumns(fields: Record<string, boolean | undefined>): Record<string, boolean> {
    // Filter out false values - only include true fields
    const entries = Object.entries(fields);
    const rs = entries.reduce((acc, [key, value]) => {
      if (value === true) {
        acc[key] = true;
      }

      return acc;
    }, {});

    return rs;
  }

  toWhere<Schema extends TTableSchemaWithId>(opts: {
    tableName: string;
    schema: Schema;
    where: TWhere<TTableObject<Schema>>;
  }): SQL | undefined {
    const { tableName, schema, where } = opts;

    const conditions: SQL[] = [];
    const columns = getTableColumns(schema);

    if (!columns || isEmpty(columns)) {
      throw getError({
        message: `[toWhere] Table: ${tableName} | Failed to get table columns | columns: ${columns}`,
      });
    }

    for (const key in where) {
      const value = where[key];
      if (value === undefined) {
        continue;
      }

      // 1. Handle Logical Groups (AND / OR)
      if (QueryOperators.LOGICAL_GROUP_OPERATORS.has(key)) {
        const clauses = (Array.isArray(value) ? value : [value])
          .map(innerWhere => this.toWhere({ tableName, schema, where: innerWhere }))
          .filter((c): c is SQL => !!c); // Remove undefined

        if (clauses.length > 0) {
          conditions.push(key === QueryOperators.AND ? and(...clauses)! : or(...clauses)!);
        }
        continue;
      }

      const column = columns?.[key];
      if (!column) {
        throw getError({
          message: `[toWhere] Table: ${tableName} | Column NOT FOUND | key: '${key}'`,
        });
      }

      // 3. Handle Short Syntax (Implicit EQ, IN, or NULL)
      // Example: { status: 'active' } or { id: [1, 2] }
      if (
        typeof value !== 'object' ||
        value === null ||
        Array.isArray(value) ||
        value instanceof Date
      ) {
        if (value === null) {
          conditions.push(isNull(column));
        } else if (Array.isArray(value)) {
          if (value.length === 0) {
            // Empty array IN () = FALSE (matches nothing)
            // Using sql`false` to ensure no rows are returned
            conditions.push(sql`false`);
          } else {
            conditions.push(inArray(column, value));
          }
        } else {
          conditions.push(eq(column, value));
        }
        continue;
      }

      // 4. Handle Operator Syntax
      // Example: { age: { gt: 10, lte: 20 } }
      for (const op in value) {
        const opVal = value[op];
        if (!QueryOperators.FNS[op]) {
          throw getError({
            message: `[toWhere] Invalid query operator to handle | operator: '${op}'`,
          });
        }

        const result = QueryOperators.FNS[op]({ column, value: opVal });

        if (!result) {
          continue;
        }

        conditions.push(result);
      }
    }

    if (!conditions.length) {
      return undefined;
    }

    if (conditions.length === 1) {
      return conditions[0];
    }

    return and(...conditions);
  }

  toOrderBy<Schema extends TTableSchemaWithId>(opts: {
    tableName: string;
    schema: Schema;
    order: string[];
  }): SQL[] {
    const { tableName, schema, order } = opts;
    if (!Array.isArray(order) || order.length === 0) {
      return [];
    }

    const columns = getTableColumns(schema);

    return order.reduce((rs, orderStr) => {
      const parts = orderStr.trim().split(/\s+/);
      const [key, direction = Sorts.ASC] = parts;

      const column = columns[key];
      if (!column) {
        throw getError({
          message: `[toOrderBy] Table: ${tableName} | Column NOT FOUND | key: '${key}'`,
        });
      }

      rs.push(direction.toLowerCase() === Sorts.DESC ? desc(column) : asc(column));
      return rs;
    }, [] as SQL[]);
  }

  toInclude(opts: {
    include: TInclusion[];
    relations: { [relationName: string]: TRelationConfig };
  }) {
    const { include, relations } = opts;

    const rs = include.reduce((acc, inc) => {
      let relationName: string;
      let scope: any = undefined;

      // Parse include syntax
      if (typeof inc === 'string') {
        relationName = inc;
      } else if (inc.relation) {
        relationName = inc.relation;
        scope = inc.scope;
      } else {
        throw getError({
          message: `[toInclude] Invalid include format | include: ${JSON.stringify(inc)}`,
        });
      }

      // Validate relation exists
      const relationConfig = relations[relationName];
      if (!relationConfig) {
        throw getError({
          message: `[toInclude] Relation NOT FOUND | relation: '${relationName}'`,
        });
      }

      // No scope - just include the relation
      if (!scope) {
        acc[relationName] = true;
        return acc;
      }

      // Build nested query with proper schema
      const nestedQuery = this.build<TTableSchemaWithId>({
        tableName: relationName,
        schema: relationConfig.schema,
        filter: scope,
        relations, // Pass relations for nested includes
      });

      acc[relationName] = nestedQuery;
      return acc;
    }, {});

    return rs;
  }
}
