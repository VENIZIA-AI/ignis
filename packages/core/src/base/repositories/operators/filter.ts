import { BaseHelper } from '@/base/helpers';
import { TTableObject, TTableSchemaWithId } from '@/base/models';
import { getError } from '@/helpers';
import { and, asc, desc, eq, getTableColumns, inArray, isNull, or, type SQL } from 'drizzle-orm';
import { DrizzleQueryOptions, TFilter, TWhere } from '../common';
import { QueryOperators, Sorts } from './query';

export class DrizzleFilterBuilder<
  EntitySchema extends TTableSchemaWithId,
  ObjectSchema = TTableObject<EntitySchema>,
> extends BaseHelper {
  constructor() {
    super({ scope: DrizzleFilterBuilder.name });
  }

  build(opts: { schema: EntitySchema; filter: TFilter<ObjectSchema> }): DrizzleQueryOptions {
    if (!opts.filter) {
      return {};
    }

    const { limit, skip, order, fields, where, include } = opts.filter;

    return {
      ...(limit !== undefined && { limit }),
      ...(skip !== undefined && { offset: skip }),
      ...(fields && { columns: fields as Record<string, boolean> }),
      ...(order && {
        orderBy: this.toOrderBy({
          schema: opts.schema,
          order,
        }),
      }),
      ...(where && {
        where: this.toWhere({
          schema: opts.schema,
          where,
        }),
      }),
      ...(include && { with: this.toInclude(include) }),
    };
  }

  toWhere(opts: { schema: EntitySchema; where: TWhere<ObjectSchema> }): SQL | undefined {
    const { schema, where } = opts;

    const conditions: SQL[] = [];
    const columns = getTableColumns(schema);

    for (const key in where) {
      const value = where[key];
      if (value === undefined) {
        continue;
      }

      // 1. Handle Logical Groups (AND / OR)
      if (QueryOperators.LOGICAL_GROUP_OPERATORS.has(key)) {
        const clauses = (Array.isArray(value) ? value : [value])
          .map(innerWhere => this.toWhere({ schema, where: innerWhere }))
          .filter((c): c is SQL => !!c); // Remove undefined

        if (clauses.length > 0) {
          conditions.push(key === QueryOperators.AND ? and(...clauses)! : or(...clauses)!);
        }
        continue;
      }

      // 2. Validate Column Existence
      const column = columns[key];
      if (!column) {
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
        if (value === null) {
          conditions.push(isNull(column));
        } else if (Array.isArray(value)) {
          conditions.push(inArray(column, value));
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

        const result = QueryOperators[op]({
          column,
          value: opVal,
        });

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

  toOrderBy(opts: { schema: EntitySchema; order: string[] }): SQL[] {
    const { schema, order } = opts;
    if (!Array.isArray(order)) {
      return [];
    }

    const columns = getTableColumns(schema);

    return order.reduce((rs, orderStr) => {
      const parts = orderStr.trim().split(/\s+/);

      const [field, direction = Sorts.ASC] = parts;
      const column = columns[field];
      if (!column) {
        throw getError({
          message: `[toOrderBy] Invalid column name to handle | column: '${column}'`,
        });
      }

      rs.push(direction.toLowerCase() === Sorts.DESC ? desc(column) : asc(column));
      return rs;
    }, [] as SQL[]);
  }

  toInclude(include: any[]) {
    return include.reduce(
      (acc, inc) => {
        // String syntax: "relationName"
        if (typeof inc === 'string') {
          acc[inc] = true;
          return acc;
        }

        // Object syntax: { relation: "relationName", scope: { ... } }
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
        acc[inc.relation] = this.build({
          schema: {} as EntitySchema,
          filter: inc.scope,
        });
      },
      {} as Record<string, any>,
    );
  }
}
