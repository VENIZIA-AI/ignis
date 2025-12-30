import { TTableObject, TTableSchemaWithId } from '@/base/models';
import { BaseHelper, getError, TConstValue } from '@venizia/ignis-helpers';
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
import {
  TDrizzleQueryOptions,
  TFields,
  TFilter,
  TInclusion,
  TRelationConfig,
  TWhere,
} from '../common';
import { QueryOperators, Sorts } from './query';

export type TRelationResolver = (schema: TTableSchemaWithId) => Record<string, TRelationConfig>;
export type THiddenPropertiesResolver = (relationName: string) => Set<string>;

export class DrizzleFilterBuilder extends BaseHelper {
  private static columnCache = new WeakMap<
    TTableSchemaWithId,
    ReturnType<typeof getTableColumns>
  >();

  constructor() {
    super({ scope: DrizzleFilterBuilder.name });
  }

  /**
   * Get table columns with caching.
   */
  private getColumns<Schema extends TTableSchemaWithId>(schema: Schema) {
    let columns = DrizzleFilterBuilder.columnCache.get(schema);
    if (!columns) {
      columns = getTableColumns(schema);
      DrizzleFilterBuilder.columnCache.set(schema, columns);
    }
    return columns;
  }

  build<Schema extends TTableSchemaWithId>(opts: {
    tableName: string;
    schema: Schema;
    relations: { [relationName: string]: TRelationConfig };
    filter: TFilter<TTableObject<Schema>>;
    relationResolver: TRelationResolver;
    hiddenPropertiesResolver?: THiddenPropertiesResolver;
  }): TDrizzleQueryOptions {
    if (!opts.filter) {
      return {};
    }

    const { tableName, schema, relations, filter, relationResolver, hiddenPropertiesResolver } =
      opts;
    const { limit, skip, order, fields, where, include } = filter;
    const rs = {
      ...(limit !== undefined && { limit }),
      ...(skip !== undefined && { offset: skip }),
      ...(fields && { columns: this.toColumns({ fields }) }),
      ...(order && { orderBy: this.toOrderBy({ tableName, schema, order }) }),
      ...(where && { where: this.toWhere({ tableName, schema, where }) }),
      ...(include && {
        with: this.toInclude({ include, relations, relationResolver, hiddenPropertiesResolver }),
      }),
    };

    return rs;
  }

  toColumns(opts: { fields: TFields }): Record<string, boolean> {
    const { fields } = opts;

    // Handle array format: ['id', 'name'] → { id: true, name: true }
    if (Array.isArray(fields)) {
      return Object.fromEntries(fields.map(field => [field, true]));
    }

    // Handle object format: { id: true, name: false } → { id: true }
    return Object.fromEntries(
      Object.entries(fields).filter(([, value]) => value === true),
    ) as Record<string, boolean>;
  }

  /**
   * Check if value is a primitive (not an operator object).
   * Primitives: null, arrays, dates, strings, numbers, booleans
   */
  private isPrimitiveValue(opts: { value: any }): boolean {
    const { value } = opts;
    return (
      value === null || Array.isArray(value) || value instanceof Date || typeof value !== 'object'
    );
  }

  /**
   * Build SQL condition for primitive values (null, array, or scalar).
   */
  private buildPrimitiveCondition(opts: { column: any; value: any }): SQL {
    const { column, value } = opts;

    // Handle null → IS NULL
    if (value === null) {
      return isNull(column);
    }

    // Handle array → IN (...)
    if (Array.isArray(value)) {
      // Empty array → always false (matches nothing)
      return value.length === 0 ? sql`false` : inArray(column, value);
    }

    // Handle scalar (string, number, boolean, Date) → equals
    return eq(column, value);
  }

  /**
   * Build SQL conditions for operator syntax like { gt: 10, lte: 20 }.
   */
  private buildOperatorConditions(opts: { column: any; value: Record<string, any> }): SQL[] {
    const { column, value } = opts;
    const conditions: SQL[] = [];

    for (const [op, val] of Object.entries(value)) {
      const opFn = QueryOperators.FNS[op];
      if (!opFn) {
        throw getError({
          message: `[DrizzleFilterBuilder][buildOperatorConditions] Invalid query operator | operator: '${op}'`,
        });
      }

      const result = opFn({ column, value: val });
      if (result) {
        conditions.push(result);
      }
    }

    return conditions;
  }

  /**
   * Build SQL condition for logical groups (AND / OR).
   */
  private buildLogicalGroupCondition<Schema extends TTableSchemaWithId>(opts: {
    key: string;
    value: any;
    tableName: string;
    schema: Schema;
  }): SQL | undefined {
    const { key, value, tableName, schema } = opts;
    const clauses = (Array.isArray(value) ? value : [value])
      .map(inner => this.toWhere({ tableName, schema, where: inner }))
      .filter((c): c is SQL => !!c);

    if (clauses.length === 0) {
      return undefined;
    }

    return key === QueryOperators.AND ? and(...clauses)! : or(...clauses)!;
  }

  toWhere<Schema extends TTableSchemaWithId>(opts: {
    tableName: string;
    schema: Schema;
    where: TWhere<TTableObject<Schema>>;
  }): SQL | undefined {
    const { tableName, schema, where } = opts;
    const columns = this.getColumns(schema);

    if (!columns || isEmpty(columns)) {
      throw getError({
        message: `[DrizzleFilterBuilder][toWhere] Table: ${tableName} | Failed to get table columns`,
      });
    }

    const conditions: SQL[] = [];

    for (const key in where) {
      const value = where[key];

      // Skip undefined values
      if (value === undefined) {
        continue;
      }

      // Handle logical groups (AND / OR)
      if (QueryOperators.LOGICAL_GROUP_OPERATORS.has(key)) {
        const condition = this.buildLogicalGroupCondition({ key, value, tableName, schema });
        if (condition) {
          conditions.push(condition);
        }
        continue;
      }

      // Validate column exists
      const column = columns[key];
      if (!column) {
        throw getError({
          message: `[DrizzleFilterBuilder][toWhere] Table: ${tableName} | Column NOT FOUND | key: '${key}'`,
        });
      }

      // Handle primitive values (null, array, scalar)
      if (this.isPrimitiveValue({ value })) {
        conditions.push(this.buildPrimitiveCondition({ column, value }));
        continue;
      }

      // Handle operator syntax { gt: 10, lte: 20 }
      conditions.push(...this.buildOperatorConditions({ column, value }));
    }

    // Return combined conditions
    if (conditions.length === 0) {
      return undefined;
    }

    return conditions.length === 1 ? conditions[0] : and(...conditions);
  }

  /**
   * Parse a JSON path string into column name and path components.
   * Example: "metadata.nested[0].field" → { columnName: "metadata", path: ["nested", "0", "field"] }
   */
  private parseJsonPath(key: string): { columnName: string; path: string[] } {
    const parts = key.split(/[.[\]]+/).filter(Boolean);
    const [columnName = key, ...path] = parts;
    return { columnName, path };
  }

  /**
   * Build SQL for ordering by a JSON/JSONB field path.
   * Uses PostgreSQL #>> operator for text extraction.
   */
  private buildJsonOrderBy(opts: {
    key: string;
    direction: TConstValue<typeof Sorts>;
    columns: ReturnType<typeof getTableColumns>;
    tableName: string;
  }): SQL {
    const { key, direction, columns, tableName } = opts;

    // Parse: "metadata.nested[0].field" → { columnName: "metadata", path: ["nested", "0", "field"] }
    const parsed = this.parseJsonPath(key);

    const column = columns[parsed.columnName];
    if (!column) {
      throw getError({
        message: `[DrizzleFilterBuilder][buildJsonOrderBy] Table: ${tableName} | Column NOT FOUND | key: '${parsed.columnName}'`,
      });
    }

    // Validate column is JSON/JSONB type
    const dataType = column.dataType.toLowerCase();
    if (dataType !== 'json' && dataType !== 'jsonb') {
      throw getError({
        message: `[DrizzleFilterBuilder][buildJsonOrderBy] Table: ${tableName} | Column '${parsed.columnName}' is not JSON/JSONB type | dataType: '${column.dataType}'`,
      });
    }

    // Validate path components to prevent SQL injection
    // Allow: identifiers (a-z, A-Z, _, 0-9 but not starting with number) or array indices (numbers only)
    const validPathPattern = /^[a-zA-Z_][a-zA-Z0-9_]*$|^\d+$/;
    for (const part of parsed.path) {
      if (!validPathPattern.test(part)) {
        throw getError({
          message: `[DrizzleFilterBuilder][buildJsonOrderBy] Table: ${tableName} | Invalid JSON path component: '${part}'`,
        });
      }
    }

    // Use #> operator (returns JSONB) to preserve original type
    // JSONB comparison: null < boolean < number < string < array < object
    return sql.raw(`"${column.name}" #> '{${parsed.path.join(',')}}' ${direction.toUpperCase()}`);
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

    const columns = this.getColumns(schema);

    return order.map(orderStr => {
      const [key, direction = Sorts.ASC] = orderStr.trim().split(/\s+/);

      // Validate direction
      if (!Sorts.isValid(direction)) {
        throw getError({
          message: `[DrizzleFilterBuilder][toOrderBy] Table: ${tableName} | Invalid direction: '${direction}' | Expected: 'ASC' or 'DESC'`,
        });
      }

      // Check if it's a JSON path (contains '.' or '[')
      if (key.includes('.') || key.includes('[')) {
        return this.buildJsonOrderBy({
          key,
          direction: direction as TConstValue<typeof Sorts>,
          columns,
          tableName,
        });
      }

      // Regular column ordering
      const column = columns[key];
      if (!column) {
        throw getError({
          message: `[DrizzleFilterBuilder][toOrderBy] Table: ${tableName} | Column NOT FOUND | key: '${key}'`,
        });
      }

      return direction.toLowerCase() === Sorts.DESC ? desc(column) : asc(column);
    });
  }

  toInclude(opts: {
    include: TInclusion[];
    relations: { [relationName: string]: TRelationConfig };
    relationResolver: TRelationResolver;
    hiddenPropertiesResolver?: THiddenPropertiesResolver;
  }): Record<string, true | TDrizzleQueryOptions> {
    const { include, relations, relationResolver, hiddenPropertiesResolver } = opts;

    return Object.fromEntries(
      include.map(inc => {
        const relationName = typeof inc === 'string' ? inc : inc.relation;
        const scope = typeof inc === 'string' ? undefined : inc.scope;

        if (!relationName) {
          throw getError({
            message: `[DrizzleFilterBuilder][toInclude] Invalid include format | include: ${JSON.stringify(inc)}`,
          });
        }

        const relationConfig = relations[relationName];
        if (!relationConfig) {
          throw getError({
            message: `[DrizzleFilterBuilder][toInclude] Relation NOT FOUND | relation: '${relationName}'`,
          });
        }

        // Resolve hidden properties for this relation
        const hiddenProps = hiddenPropertiesResolver?.(relationName) ?? new Set<string>();

        // If no scope and no hidden properties, return simple true (select all)
        if (!scope && hiddenProps.size === 0) {
          return [relationName, true];
        }

        // Build nested query
        const nestedQuery = this.build<TTableSchemaWithId>({
          tableName: relationName,
          schema: relationConfig.schema,
          filter: scope ?? {},
          relations: relationResolver?.(relationConfig.schema) ?? {},
          relationResolver,
          hiddenPropertiesResolver,
        });

        // Apply hidden properties exclusion to relation columns
        if (hiddenProps.size > 0) {
          const columns = getTableColumns(relationConfig.schema);

          // If columns already specified, filter out hidden
          // If no columns specified, create columns object excluding hidden
          const baseColumns = nestedQuery.columns
            ? nestedQuery.columns
            : Object.fromEntries(Object.keys(columns).map(k => [k, true]));

          const filteredColumns: Record<string, boolean> = {};
          for (const [key, isEnabled] of Object.entries(baseColumns)) {
            if (!hiddenProps.has(key)) {
              filteredColumns[key] = isEnabled as boolean;
            }
          }

          nestedQuery.columns = filteredColumns;
        }

        return [relationName, nestedQuery];
      }),
    );
  }
}
