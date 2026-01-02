import { TTableObject, TTableSchemaWithId } from '@/base/models';
import { MetadataRegistry } from '@/helpers/inversion';
import { BaseHelper, getError, resolveValue, TConstValue } from '@venizia/ignis-helpers';
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
import { getTableConfig } from 'drizzle-orm/pg-core';
import isEmpty from 'lodash/isEmpty';
import merge from 'lodash/merge';
import set from 'lodash/set';
import {
  TDrizzleQueryOptions,
  TFields,
  TFilter,
  TInclusion,
  TRelationConfig,
  TWhere,
} from '../common';
import { QueryOperators, Sorts } from './query';

export class FilterBuilder extends BaseHelper {
  // ---------------------------------------------------------------------------
  // Static Properties
  // ---------------------------------------------------------------------------

  private static columnCache = new WeakMap<
    TTableSchemaWithId,
    ReturnType<typeof getTableColumns>
  >();

  // Allows: identifiers with hyphens for kebab-case (e.g., user-id, meta_data) or array indices
  private static readonly JSON_PATH_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_-]*$|^\d+$/;

  // ---------------------------------------------------------------------------
  // Constructor
  // ---------------------------------------------------------------------------

  constructor() {
    super({ scope: FilterBuilder.name });
  }

  // ---------------------------------------------------------------------------
  // Public Methods
  // ---------------------------------------------------------------------------

  /**
   * Merge default filter with user-provided filter.
   *
   * Merge strategy:
   * - where: Deep merge (user overrides matching keys)
   * - All other fields: User completely replaces default (if provided)
   *
   * @example
   * // Default: { where: { isDeleted: false }, limit: 100, order: ['createdAt DESC'] }
   * // User: { where: { status: 'active' }, limit: 10 }
   * // Result: { where: { isDeleted: false, status: 'active' }, limit: 10, order: ['createdAt DESC'] }
   */
  mergeFilter<T = any>(opts: { defaultFilter?: TFilter<T>; userFilter?: TFilter<T> }): TFilter<T> {
    const { defaultFilter, userFilter } = opts;

    if (!defaultFilter) {
      return userFilter ?? {};
    }

    if (!userFilter) {
      return { ...defaultFilter };
    }

    // Merge where: deep merge with user values taking precedence
    const defaultWhere = defaultFilter.where;
    const userWhere = userFilter.where;
    let mergedWhere: TWhere<T> | undefined;

    if (defaultWhere && userWhere) {
      mergedWhere = merge({}, defaultWhere, userWhere);
    } else {
      mergedWhere = userWhere ?? defaultWhere;
    }

    return {
      where: mergedWhere,
      order: userFilter.order ?? defaultFilter.order,
      limit: userFilter.limit ?? defaultFilter.limit,
      offset: userFilter.offset ?? defaultFilter.offset,
      skip: userFilter.skip ?? defaultFilter.skip,
      fields: userFilter.fields ?? defaultFilter.fields,
      include: userFilter.include ?? defaultFilter.include,
    };
  }

  /**
   * Resolve hidden properties for a schema from MetadataRegistry.
   */
  resolveHiddenProperties(opts: { schema: TTableSchemaWithId }): Set<string> {
    const { schema } = opts;

    try {
      const tableName = getTableConfig(schema).name;
      const registry = MetadataRegistry.getInstance();
      const modelEntry = registry.getModelEntry({ name: tableName });

      return new Set(modelEntry?.metadata?.settings?.hiddenProperties ?? []);
    } catch {
      return new Set();
    }
  }

  /**
   * Resolve relations for a schema from MetadataRegistry.
   */
  resolveRelations(opts: { schema: TTableSchemaWithId }): Record<string, TRelationConfig> {
    const { schema } = opts;

    try {
      const tableName = getTableConfig(schema).name;
      const registry = MetadataRegistry.getInstance();
      const modelEntry = registry.getModelEntry({ name: tableName });

      if (!modelEntry?.relationsResolver) {
        return {};
      }

      const relationsArray = resolveValue(modelEntry.relationsResolver) as Array<TRelationConfig>;
      const relationsRecord: Record<string, TRelationConfig> = {};

      for (const relation of relationsArray) {
        relationsRecord[relation.name] = relation;
      }

      return relationsRecord;
    } catch {
      return {};
    }
  }

  /**
   * Build Drizzle query options from a filter object.
   */
  build<Schema extends TTableSchemaWithId>(opts: {
    tableName: string;
    schema: Schema;
    filter: TFilter<TTableObject<Schema>>;
  }): TDrizzleQueryOptions {
    if (!opts.filter) {
      return {};
    }

    const { tableName, schema, filter } = opts;
    const { limit, skip, order, fields, where, include } = filter;

    // Derive relations from MetadataRegistry
    const relations = this.resolveRelations({ schema });

    return {
      ...(limit !== undefined && { limit }),
      ...(skip !== undefined && { offset: skip }),
      ...(fields && { columns: this.toColumns({ fields }) }),
      ...(order && { orderBy: this.toOrderBy({ tableName, schema, order }) }),
      ...(where && { where: this.toWhere({ tableName, schema, where }) }),
      ...(include && { with: this.toInclude({ include, relations }) }),
    };
  }

  /**
   * Convert fields to Drizzle columns format.
   */
  toColumns(opts: { fields: TFields }): Record<string, boolean> {
    const { fields } = opts;
    const result: Record<string, boolean> = {};

    // Array format: ['id', 'name'] → { id: true, name: true }
    if (Array.isArray(fields)) {
      for (const field of fields) {
        set(result, field, true);
      }
      return result;
    }

    // Object format: { id: true, name: false } → { id: true }
    for (const key in fields) {
      if (fields[key] === true) {
        result[key] = true;
      }
    }
    return result;
  }

  /**
   * Convert where clause to Drizzle SQL condition.
   */
  toWhere<Schema extends TTableSchemaWithId>(opts: {
    tableName: string;
    schema: Schema;
    where: TWhere<TTableObject<Schema>>;
  }): SQL | undefined {
    const { tableName, schema, where } = opts;
    const columns = this.getColumns(schema);

    if (!columns || isEmpty(columns)) {
      throw getError({
        message: `[FilterBuilder][toWhere] Table: ${tableName} | Failed to get table columns`,
      });
    }

    const conditions: SQL[] = [];

    for (const key in where) {
      const value = where[key];

      if (value === undefined) {
        continue;
      }

      // Logical groups (AND / OR)
      if (QueryOperators.LOGICAL_GROUP_OPERATORS.has(key)) {
        const condition = this.buildLogicalGroupCondition({ key, value, tableName, schema });
        if (condition) {
          conditions.push(condition);
        }
        continue;
      }

      // JSON path (contains '.' or '[')
      if (this.isJsonPath({ key })) {
        conditions.push(...this.buildJsonWhereCondition({ key, value, columns, tableName }));
        continue;
      }

      // Regular column
      const column = columns[key];
      if (!column) {
        throw getError({
          message: `[FilterBuilder][toWhere] Table: ${tableName} | Column NOT FOUND | key: '${key}'`,
        });
      }

      if (!this.isOperatorObject({ value })) {
        conditions.push(this.buildValueCondition({ column, value }));
        continue;
      }

      conditions.push(...this.buildOperatorConditions({ column, value }));
    }

    if (conditions.length === 0) {
      return undefined;
    }

    return conditions.length === 1 ? conditions[0] : and(...conditions);
  }

  /**
   * Convert order clause to Drizzle SQL order expressions.
   */
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

      if (!Sorts.isValid(direction)) {
        throw getError({
          message: `[FilterBuilder][toOrderBy] Table: ${tableName} | Invalid direction: '${direction}' | Expected: 'ASC' or 'DESC'`,
        });
      }

      // JSON path
      if (this.isJsonPath({ key })) {
        return this.buildJsonOrderBy({
          key,
          direction: direction as TConstValue<typeof Sorts>,
          columns,
          tableName,
        });
      }

      // Regular column
      const column = columns[key];
      if (!column) {
        throw getError({
          message: `[FilterBuilder][toOrderBy] Table: ${tableName} | Column NOT FOUND | key: '${key}'`,
        });
      }

      return direction.toLowerCase() === Sorts.DESC ? desc(column) : asc(column);
    });
  }

  /**
   * Convert include clause to Drizzle with options.
   */
  toInclude(opts: {
    include: TInclusion[];
    relations: { [relationName: string]: TRelationConfig };
  }): Record<string, true | TDrizzleQueryOptions> {
    const { include, relations } = opts;
    const result: Record<string, true | TDrizzleQueryOptions> = {};

    for (const inc of include) {
      const relationName = typeof inc === 'string' ? inc : inc.relation;
      const scope = typeof inc === 'string' ? undefined : inc.scope;

      if (!relationName) {
        throw getError({
          message: `[FilterBuilder][toInclude] Invalid include format | include: ${JSON.stringify(inc)}`,
        });
      }

      const relationConfig = relations[relationName];
      if (!relationConfig) {
        throw getError({
          message: `[FilterBuilder][toInclude] Relation NOT FOUND | relation: '${relationName}'`,
        });
      }

      const hiddenProps = this.resolveHiddenProperties({ schema: relationConfig.schema });

      // No scope and no hidden properties → simple true
      if (!scope && hiddenProps.size === 0) {
        result[relationName] = true;
        continue;
      }

      // Build nested query (recursively uses stored resolvers)
      const nestedQuery = this.build<TTableSchemaWithId>({
        tableName: relationName,
        schema: relationConfig.schema,
        filter: scope ?? {},
      });

      // Apply hidden properties exclusion
      if (hiddenProps.size > 0) {
        const filteredColumns: Record<string, boolean> = {};

        if (nestedQuery.columns) {
          // User specified fields - filter out hidden
          for (const key in nestedQuery.columns) {
            if (!hiddenProps.has(key)) {
              filteredColumns[key] = nestedQuery.columns[key];
            }
          }
        } else {
          // No fields specified - build from schema columns
          const cols = getTableColumns(relationConfig.schema);
          for (const key in cols) {
            if (!hiddenProps.has(key)) {
              filteredColumns[key] = true;
            }
          }
        }

        nestedQuery.columns = filteredColumns;
      }

      result[relationName] = nestedQuery;
    }

    return result;
  }

  // ---------------------------------------------------------------------------
  // Private Helpers - Column Cache
  // ---------------------------------------------------------------------------

  private getColumns<Schema extends TTableSchemaWithId>(schema: Schema) {
    let columns = FilterBuilder.columnCache.get(schema);
    if (!columns) {
      columns = getTableColumns(schema);
      FilterBuilder.columnCache.set(schema, columns);
    }
    return columns;
  }

  // ---------------------------------------------------------------------------
  // Private Helpers - Type Checking
  // ---------------------------------------------------------------------------

  private isJsonPath(opts: { key: string }): boolean {
    const { key } = opts;
    return key.includes('.') || key.includes('[');
  }

  private isPrimitiveValue(opts: { value: any }): boolean {
    const { value } = opts;
    return (
      value === null || Array.isArray(value) || value instanceof Date || typeof value !== 'object'
    );
  }

  private isOperatorObject(opts: { value: any }): boolean {
    const { value } = opts;

    if (this.isPrimitiveValue({ value })) {
      return false;
    }

    const keys = Object.keys(value);
    if (keys.length === 0) {
      return false;
    }

    return keys.every(key => QueryOperators.isValid(key));
  }

  // ---------------------------------------------------------------------------
  // Private Helpers - SQL Condition Builders
  // ---------------------------------------------------------------------------

  private buildValueCondition(opts: { column: any; value: any }): SQL {
    const { column, value } = opts;

    if (value === null) {
      return isNull(column);
    }

    if (Array.isArray(value)) {
      return value.length === 0 ? sql`false` : inArray(column, value);
    }

    return eq(column, value);
  }

  private buildOperatorConditions(opts: { column: any; value: Record<string, any> }): SQL[] {
    const { column, value } = opts;
    const conditions: SQL[] = [];

    for (const op in value) {
      const opFn = QueryOperators.FNS[op];
      if (!opFn) {
        throw getError({
          message: `[FilterBuilder][buildOperatorConditions] Invalid query operator | operator: '${op}'`,
        });
      }

      const result = opFn({ column, value: value[op] });
      if (result) {
        conditions.push(result);
      }
    }

    return conditions;
  }

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

  // ---------------------------------------------------------------------------
  // Private Helpers - JSON Path Handling
  // ---------------------------------------------------------------------------

  private parseJsonPath(key: string): { columnName: string; path: string[] } {
    const parts = key.split(/[.[\]]+/).filter(Boolean);
    const [columnName = key, ...path] = parts;
    return { columnName, path };
  }

  private validateJsonColumn(opts: {
    key: string;
    columns: ReturnType<typeof getTableColumns>;
    tableName: string;
    methodName: string;
  }): { column: ReturnType<typeof getTableColumns>[string]; path: string[] } {
    const { key, columns, tableName, methodName } = opts;

    const parsed = this.parseJsonPath(key);

    const column = columns[parsed.columnName];
    if (!column) {
      throw getError({
        message: `[FilterBuilder][${methodName}] Table: ${tableName} | Column NOT FOUND | key: '${parsed.columnName}'`,
      });
    }

    const dataType = column.dataType.toLowerCase();
    if (dataType !== 'json' && dataType !== 'jsonb') {
      throw getError({
        message: `[FilterBuilder][${methodName}] Table: ${tableName} | Column '${parsed.columnName}' is not JSON/JSONB type | dataType: '${column.dataType}'`,
      });
    }

    for (const part of parsed.path) {
      if (!FilterBuilder.JSON_PATH_PATTERN.test(part)) {
        throw getError({
          message: `[FilterBuilder][${methodName}] Table: ${tableName} | Invalid JSON path component: '${part}'`,
        });
      }
    }

    return { column, path: parsed.path };
  }

  private buildJsonWhereCondition(opts: {
    key: string;
    value: any;
    columns: ReturnType<typeof getTableColumns>;
    tableName: string;
  }): SQL[] {
    const { key, value, columns, tableName } = opts;

    const { column, path } = this.validateJsonColumn({
      key,
      columns,
      tableName,
      methodName: 'buildJsonWhereCondition',
    });

    const jsonPath = `"${column.name}" #>> '{${path.join(',')}}'`;
    const safeNumericCast = `CASE WHEN (${jsonPath}) ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (${jsonPath})::numeric ELSE NULL END`;

    if (!this.isOperatorObject({ value })) {
      const jsonExtraction =
        typeof value === 'number' ? sql.raw(safeNumericCast) : sql.raw(jsonPath);
      return [this.buildValueCondition({ column: jsonExtraction, value })];
    }

    const jsonExtraction = QueryOperators.hasNumericComparison({ operators: value })
      ? sql.raw(safeNumericCast)
      : sql.raw(jsonPath);

    return this.buildOperatorConditions({ column: jsonExtraction, value });
  }

  private buildJsonOrderBy(opts: {
    key: string;
    direction: TConstValue<typeof Sorts>;
    columns: ReturnType<typeof getTableColumns>;
    tableName: string;
  }): SQL {
    const { key, direction, columns, tableName } = opts;

    const { column, path } = this.validateJsonColumn({
      key,
      columns,
      tableName,
      methodName: 'buildJsonOrderBy',
    });

    return sql.raw(`"${column.name}" #> '{${path.join(',')}}' ${direction.toUpperCase()}`);
  }
}
