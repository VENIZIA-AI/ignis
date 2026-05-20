import { TTableObject, TTableSchemaWithId } from '@/base/models';
import { MetadataRegistry } from '@/helpers/inversion';
import { BaseHelper, getError, resolveValue, TConstValue } from '@venizia/ignis-helpers';
import { and, asc, desc, eq, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/pg-core';
import isEmpty from 'lodash/isEmpty';
import merge from 'lodash/merge';
import set from 'lodash/set';
import {
  DEFAULT_LIMIT,
  getCachedColumns,
  RelationTypes,
  TDrizzleQueryOptions,
  TFields,
  TFilter,
  TInclusion,
  TRelationConfig,
  TTableColumns,
  TWhere,
} from '../common';
import {
  isJsonPath,
  parseJsonPath,
  validateJsonColumnType,
  validateJsonPathComponents,
} from './json-utils';
import { QueryOperators, Sorts } from './query';

/** Converts filter objects into Drizzle ORM query options (where, order, columns, relations). */
export class FilterBuilder extends BaseHelper {
  constructor() {
    super({ scope: FilterBuilder.name });
  }
  /** Merges default filter with user filter. Where is deep-merged; other fields user-wins. */
  mergeFilter<T = any>(opts: { defaultFilter?: TFilter<T>; userFilter?: TFilter<T> }): TFilter<T> {
    const { defaultFilter, userFilter } = opts;

    if (!defaultFilter) {
      return userFilter ?? {};
    }

    if (!userFilter) {
      return { ...defaultFilter };
    }

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

  /** Resolves hidden properties for a schema from MetadataRegistry. */
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

  /** Resolves default filter for a schema from MetadataRegistry. */
  resolveDefaultFilter(opts: { schema: TTableSchemaWithId }): TFilter | undefined {
    const { schema } = opts;

    try {
      const tableName = getTableConfig(schema).name;
      const registry = MetadataRegistry.getInstance();
      const modelEntry = registry.getModelEntry({ name: tableName });

      return modelEntry?.metadata?.settings?.defaultFilter;
    } catch {
      return undefined;
    }
  }

  /** Resolves relation configurations for a schema from MetadataRegistry. */
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

  /** Builds Drizzle query options from a filter object. */
  build<Schema extends TTableSchemaWithId>(opts: {
    tableName: string;
    schema: Schema;
    filter: TFilter<TTableObject<Schema>>;
  }): TDrizzleQueryOptions {
    if (!opts.filter) {
      return {};
    }

    const { tableName, schema, filter } = opts;
    const { limit, skip, offset, order, fields, where, include } = filter;

    const relations = this.resolveRelations({ schema });
    const effectiveOffset = skip ?? offset;

    return {
      ...(limit !== undefined && { limit }),
      ...(effectiveOffset !== undefined && { offset: effectiveOffset }),
      ...(fields && { columns: this.toColumns({ fields }) }),
      ...(order && { orderBy: this.toOrderBy({ tableName, schema, order }) }),
      ...(where && { where: this.toWhere({ tableName, schema, where }) }),
      ...(include && { with: this.toInclude({ include, relations }) }),
    };
  }

  /** Converts fields selection to Drizzle columns format. */
  toColumns(opts: { fields: TFields }): Record<string, boolean> {
    const { fields } = opts;
    const result: Record<string, boolean> = {};

    if (Array.isArray(fields)) {
      for (const field of fields) {
        set(result, field, true);
      }
      return result;
    }

    for (const key in fields) {
      if (fields[key] === true) {
        result[key] = true;
      }
    }
    return result;
  }

  /** Converts a where clause to a Drizzle SQL condition (supports operators, JSON paths, AND/OR). */
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

      if (QueryOperators.LOGICAL_GROUP_OPERATORS.has(key)) {
        const condition = this.buildLogicalGroupCondition({ key, value, tableName, schema });
        if (condition) {
          conditions.push(condition);
        }
        continue;
      }

      if (isJsonPath({ key })) {
        conditions.push(...this.buildJsonWhereCondition({ key, value, columns, tableName }));
        continue;
      }

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

  /** Converts order strings to Drizzle SQL order expressions (supports JSON paths). */
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

      if (isJsonPath({ key })) {
        return this.buildJsonOrderBy({
          key,
          direction: direction as TConstValue<typeof Sorts>,
          columns,
          tableName,
        });
      }

      const column = columns[key];
      if (!column) {
        throw getError({
          message: `[FilterBuilder][toOrderBy] Table: ${tableName} | Column NOT FOUND | key: '${key}'`,
        });
      }

      return direction.toLowerCase() === Sorts.DESC ? desc(column) : asc(column);
    });
  }

  /** Converts include clause to Drizzle 'with' options with nested filtering and hidden prop exclusion. */
  toInclude(opts: {
    include: TInclusion[];
    relations: { [relationName: string]: TRelationConfig };
  }): Record<string, true | TDrizzleQueryOptions> {
    const { include, relations } = opts;
    const result: Record<string, true | TDrizzleQueryOptions> = {};

    for (const inc of include) {
      const relationName = typeof inc === 'string' ? inc : inc.relation;
      const scope = typeof inc === 'string' ? undefined : inc.scope;
      const shouldSkipDefaultFilter = typeof inc === 'string' ? false : inc.shouldSkipDefaultFilter;

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

      const defaultFilter = shouldSkipDefaultFilter
        ? undefined
        : this.resolveDefaultFilter({ schema: relationConfig.schema });

      const mergedScope = this.mergeFilter({ defaultFilter, userFilter: scope });
      const scopedFilter: TFilter =
        relationConfig.type === RelationTypes.MANY
          ? { ...mergedScope, limit: mergedScope.limit ?? DEFAULT_LIMIT }
          : mergedScope;

      const hasNoEffectiveFilter = isEmpty(scopedFilter) || Object.keys(scopedFilter).length === 0;
      if (hasNoEffectiveFilter && hiddenProps.size === 0) {
        result[relationName] = true;
        continue;
      }

      const nestedQuery = this.build<TTableSchemaWithId>({
        tableName: relationName,
        schema: relationConfig.schema,
        filter: scopedFilter,
      });

      if (hiddenProps.size > 0) {
        const filteredColumns: Record<string, boolean> = {};

        if (nestedQuery.columns) {
          for (const key in nestedQuery.columns) {
            if (!hiddenProps.has(key)) {
              filteredColumns[key] = nestedQuery.columns[key];
            }
          }
        } else {
          const cols = getCachedColumns(relationConfig.schema);
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
  /** Gets columns using shared cache utility. */
  private getColumns<Schema extends TTableSchemaWithId>(schema: Schema) {
    return getCachedColumns(schema);
  }
  /** Checks if a value is a primitive (not an operator object). */
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
  /** Builds a SQL condition for a simple value (null, array, or equality). */
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

  /** Builds SQL conditions for logical groups (AND/OR). */
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

  private validateJsonColumn(opts: {
    key: string;
    columns: TTableColumns;
    tableName: string;
    methodName: string;
  }): { column: TTableColumns[string]; path: string[] } {
    const { key, columns, tableName, methodName } = opts;

    const parsed = parseJsonPath({ key });

    const column = columns[parsed.columnName];
    if (!column) {
      throw getError({
        message: `[FilterBuilder][${methodName}] Table: ${tableName} | Column NOT FOUND | key: '${parsed.columnName}'`,
      });
    }

    validateJsonColumnType({
      column,
      columnName: parsed.columnName,
      tableName,
      methodName: `FilterBuilder.${methodName}`,
    });

    validateJsonPathComponents({
      path: parsed.path,
      tableName,
      methodName: `FilterBuilder.${methodName}`,
    });

    return { column, path: parsed.path };
  }

  private buildJsonWhereCondition(opts: {
    key: string;
    value: any;
    columns: TTableColumns;
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
    columns: TTableColumns;
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
