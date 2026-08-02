import type {
  TDrizzleQueryOptions,
  TFields,
  TFilter,
  TInclusion,
  TQueryOperatorHandlers,
  TWhere,
} from '@/base/repositories/common';
import { DEFAULT_LIMIT, QueryOperators, RelationTypes, Sorts } from '@/base/repositories/common';
import type { TTableObject, TTableSchemaWithId } from '@/connectors/relational/models/common';
import { MetadataRegistry } from '@/helpers/inversion';
import type { TConstValue } from '@venizia/ignis-helpers';
import { BaseHelper, ErrorPrettier, getError, resolveValue } from '@venizia/ignis-helpers';
import {
  and,
  asc,
  desc,
  eq,
  getTableName,
  inArray,
  isNull,
  not,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import isEmpty from 'lodash/isEmpty';
import set from 'lodash/set';
import type { TRelationConfig, TTableColumns } from '../common';
import { getCachedColumns } from '../common';
import {
  isJsonPath,
  parseJsonPath,
  validateJsonColumnType,
  validateJsonPathComponents,
} from './internal/json-utils';

/** Operators whose scalar operand determines the JSON numeric-cast need in jsonNeedsNumericCast. */
const SCALAR_EQUALITY_OPERATORS = new Set<string>([
  QueryOperators.EQ,
  QueryOperators.NE,
  QueryOperators.NEQ,
]);
/** Operators whose array operand determines the JSON numeric-cast need in jsonNeedsNumericCast. */
const MEMBERSHIP_OPERATORS = new Set<string>([
  QueryOperators.IN,
  QueryOperators.INQ,
  QueryOperators.NIN,
]);

/** Converts filter objects into Drizzle ORM query options (where, order, columns, relations). Engine-neutral: it names no SQL engine, and each engine branch supplies one by extending it. */
// Filter translation only - `implements IRelationalQueryDialect` sits on each engine's query dialect, which adds the port's JSON-path update methods. Keeping the clause here would drag update composition, which is engine-specific, into this file.
export abstract class FilterBuilder extends BaseHelper {
  /** Per-schema memo of resolved relations; `@model` settings are immutable after boot, so the registry lookup + resolver invocation runs once per schema (mirrors getCachedColumns). */
  private readonly _relationsCache = new WeakMap<
    TTableSchemaWithId,
    Record<string, TRelationConfig>
  >();

  constructor() {
    super({ scope: FilterBuilder.name });
  }

  /** The operator table every `where` translation resolves handlers from. Abstract so this class names no engine: each SQL engine returns its own table and inherits the whole walk unchanged. */
  protected abstract get operators(): TQueryOperatorHandlers;

  /** Merges default and user filters. `where` merges at the TOP KEY LEVEL, never index-wise (that corrupts operator arrays); operator-object collisions AND-compose so a default scope can only be narrowed; user `undefined` never overrides a defined default; other parts are user-wins. */
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
      mergedWhere = this.mergeWhere({ defaultWhere, userWhere });
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

  /** Top-key merge: operator-object collisions AND-compose under the reserved `and` key, merging with an existing `and` rather than clobbering it; every other collision is user-wins. */
  private mergeWhere<T = any>(opts: { defaultWhere: TWhere<T>; userWhere: TWhere<T> }): TWhere<T> {
    const { defaultWhere, userWhere } = opts;

    const merged: TWhere = { ...defaultWhere };
    const composed: TWhere[] = [];

    for (const key in userWhere) {
      const userValue = userWhere[key];

      if (userValue === undefined) {
        continue;
      }

      const defaultValue = defaultWhere[key];

      // Scalar-over-scalar stays a plain override (the opt-out of a soft-delete default); every other collision AND-composes so a user operator object cannot swallow a scalar default.
      const isCollision = defaultValue !== undefined;

      // `and`/`or` are the shapes a SCOPE is written in (soft-delete, tenant, ownership) and both sides are arrays, which `isPrimitiveValue` counts as scalar - without these two branches the caller's group replaces the default's outright and the scope is gone.
      if (isCollision && key === QueryOperators.AND) {
        // Both conjunct lists must hold: concatenating them IS the AND of the two groups.
        merged.and = [...defaultValue, ...userValue];
        continue;
      }

      if (isCollision && key === QueryOperators.OR) {
        // Two disjunctions cannot be concatenated - that would UNION them, widening the query; each group has to hold on its own, so they become two separate conjuncts.
        delete merged[key];
        composed.push({ [key]: defaultValue }, { [key]: userValue });
        continue;
      }

      const isScalarOverride =
        !this.isOperatorObject({ value: defaultValue }) &&
        !this.isOperatorObject({ value: userValue });

      if (isCollision && !isScalarOverride) {
        delete merged[key];
        composed.push({ [key]: defaultValue }, { [key]: userValue });
        continue;
      }

      merged[key] = userValue;
    }

    if (composed.length) {
      merged.and = merged.and ? [...merged.and, ...composed] : composed;
    }

    return merged as TWhere<T>;
  }

  /** Registry lookup shared by the resolvers below; a failure degrades to no settings rather than failing the query, and is never silent - `resolveHiddenProperties` degrading would stop hidden columns being omitted. */
  private resolveModelEntry(opts: { schema: TTableSchemaWithId; methodName: string }) {
    const { schema, methodName } = opts;

    try {
      const tableName = getTableName(schema);
      return MetadataRegistry.getInstance().getModelEntry({ name: tableName });
    } catch (error) {
      this.logger.warn(
        '[%s] Model metadata lookup failed - continuing without model settings | %s',
        methodName,
        ErrorPrettier.format({ error }),
      );
      return undefined;
    }
  }

  /** Resolves hidden properties by SQL table name, not class - `toInclude` only has a relation's `schema`, no class reference. Diverges from the class-keyed lookup elsewhere if `@model({ tableName })` != the pgTable name. */
  resolveHiddenProperties(opts: { schema: TTableSchemaWithId }): Set<string> {
    const modelEntry = this.resolveModelEntry({
      schema: opts.schema,
      methodName: 'resolveHiddenProperties',
    });

    return new Set(modelEntry?.metadata?.settings?.hiddenProperties ?? []);
  }

  /** Resolves default filter for a schema from MetadataRegistry. */
  resolveDefaultFilter(opts: { schema: TTableSchemaWithId }): TFilter | undefined {
    const modelEntry = this.resolveModelEntry({
      schema: opts.schema,
      methodName: 'resolveDefaultFilter',
    });

    return modelEntry?.metadata?.settings?.defaultFilter;
  }

  /** Resolves default row limit for a schema from MetadataRegistry. */
  resolveDefaultLimit(opts: { schema: TTableSchemaWithId }): number | undefined {
    const modelEntry = this.resolveModelEntry({
      schema: opts.schema,
      methodName: 'resolveDefaultLimit',
    });

    return modelEntry?.metadata?.settings?.defaultLimit;
  }

  /** Resolves relation configurations for a schema from MetadataRegistry. Memoized per schema. */
  resolveRelations(opts: { schema: TTableSchemaWithId }): Record<string, TRelationConfig> {
    const { schema } = opts;

    const cached = this._relationsCache.get(schema);
    if (cached) {
      return cached;
    }

    const resolved = this.resolveRelationsUncached({ schema });
    this._relationsCache.set(schema, resolved);
    return resolved;
  }

  private resolveRelationsUncached(opts: {
    schema: TTableSchemaWithId;
  }): Record<string, TRelationConfig> {
    const { schema } = opts;
    const modelEntry = this.resolveModelEntry({ schema, methodName: 'resolveRelationsUncached' });

    if (!modelEntry?.relationsResolver) {
      return {};
    }

    try {
      const relationsArray = resolveValue(modelEntry.relationsResolver) as Array<TRelationConfig>;
      const relationsRecord: Record<string, TRelationConfig> = {};

      for (const relation of relationsArray) {
        relationsRecord[relation.name] = relation;
      }

      return relationsRecord;
    } catch (error) {
      this.logger.warn(
        '[resolveRelationsUncached] Relations resolver failed - continuing without relations | %s',
        ErrorPrettier.format({ error }),
      );
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

    const effectiveOffset = skip ?? offset;

    return {
      ...(limit !== undefined && { limit }),
      ...(effectiveOffset !== undefined && { offset: effectiveOffset }),
      ...(fields && { columns: this.toColumns({ fields }) }),
      ...(order && { orderBy: this.toOrderBy({ tableName, schema, order }) }),
      ...(where && { where: this.toWhere({ tableName, schema, where }) }),
      ...(include && {
        with: this.toInclude({ include, relations: this.resolveRelations({ schema }) }),
      }),
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

      conditions.push(...this.buildWhereKeyConditions({ key, value, columns, tableName, schema }));
    }

    if (conditions.length === 0) {
      return undefined;
    }

    return conditions.length === 1 ? conditions[0] : and(...conditions);
  }

  /** Conditions contributed by a single where key: a logical group, a JSON path, a bare value or an operator object. */
  private buildWhereKeyConditions<Schema extends TTableSchemaWithId>(opts: {
    key: string;
    value: any;
    columns: TTableColumns;
    tableName: string;
    schema: Schema;
  }): SQL[] {
    const { key, value, columns, tableName, schema } = opts;

    if (QueryOperators.LOGICAL_GROUP_OPERATORS.has(key)) {
      const condition = this.buildLogicalGroupCondition({ key, value, tableName, schema });
      return condition ? [condition] : [];
    }

    if (isJsonPath({ key })) {
      return this.buildJsonWhereCondition({ key, value, columns, tableName });
    }

    const column = columns[key];
    if (!column) {
      throw getError({
        message: `[FilterBuilder][toWhere] Table: ${tableName} | Column NOT FOUND | key: '${key}'`,
      });
    }

    if (!this.isOperatorObject({ value })) {
      return [this.buildValueCondition({ column, value })];
    }

    return this.buildOperatorConditions({ column, value });
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
          ? {
              ...mergedScope,
              limit:
                mergedScope.limit ??
                this.resolveDefaultLimit({ schema: relationConfig.schema }) ??
                DEFAULT_LIMIT,
            }
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
        nestedQuery.columns = this.omitHiddenColumns({
          columns: nestedQuery.columns,
          schema: relationConfig.schema,
          hiddenProps,
        });
      }

      result[relationName] = nestedQuery;
    }

    return result;
  }

  /** Column selection with hidden properties removed; a nullish `columns` means "every schema column". */
  private omitHiddenColumns(opts: {
    columns?: Record<string, boolean>;
    schema: TTableSchemaWithId;
    hiddenProps: Set<string>;
  }): Record<string, boolean> {
    const { columns, schema, hiddenProps } = opts;
    const source = columns ?? getCachedColumns(schema);
    const filteredColumns: Record<string, boolean> = {};

    for (const key in source) {
      if (hiddenProps.has(key)) {
        continue;
      }

      filteredColumns[key] = columns ? columns[key] : true;
    }

    return filteredColumns;
  }
  private getColumns<Schema extends TTableSchemaWithId>(schema: Schema) {
    return getCachedColumns(schema);
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

  protected buildOperatorConditions(opts: { column: any; value: Record<string, any> }): SQL[] {
    const { column, value } = opts;
    const conditions: SQL[] = [];

    for (const op in value) {
      // `not` needs recursion into a nested condition, which the static FNS handlers can't reach - built here where buildOperatorConditions/buildValueCondition are available.
      if (op === QueryOperators.NOT) {
        conditions.push(this.buildNotCondition({ column, value: value[op] }));
        continue;
      }

      const opFn = this.operators[op];
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

  /** Negates a nested condition: `not: <operatorObject>` recurses into the operators, `not: <bareValue>` negates the equality/array/null condition for that value. */
  private buildNotCondition(opts: { column: any; value: any }): SQL {
    const { column, value } = opts;

    if (this.isOperatorObject({ value })) {
      const nested = this.buildOperatorConditions({ column, value });
      const combined = nested.length === 1 ? nested[0] : and(...nested)!;
      return not(combined);
    }

    return not(this.buildValueCondition({ column, value }));
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
      // An empty conjunction is vacuously TRUE so dropping it is correct, but an empty DISJUNCTION is FALSE and dropping it WIDENS the query - `or: permittedOrgIds.map(id => ({ orgId: id }))` with an empty permission list must return nothing, not everything.
      return key === QueryOperators.AND ? undefined : sql`false`;
    }

    return key === QueryOperators.AND ? and(...clauses)! : or(...clauses)!;
  }

  protected validateJsonColumn(opts: {
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

  /** JSON `#>>` extraction is text, so a numeric operand needs a numeric cast to avoid 'operator does not exist: text = integer'; true for numeric comparisons and for eq/ne/neq/in/inq/nin whose operand is a number or all-number array. */
  protected jsonNeedsNumericCast(opts: { operators: Record<string, any> }): boolean {
    const { operators } = opts;

    if (QueryOperators.hasNumericComparison({ operators })) {
      return true;
    }

    for (const op in operators) {
      const operand = operators[op];

      if (SCALAR_EQUALITY_OPERATORS.has(op) && typeof operand === 'number') {
        return true;
      }

      if (
        MEMBERSHIP_OPERATORS.has(op) &&
        Array.isArray(operand) &&
        operand.length > 0 &&
        operand.every(entry => typeof entry === 'number')
      ) {
        return true;
      }
    }

    return false;
  }

  protected buildJsonWhereCondition(opts: {
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

    return this.buildJsonOperatorConditions({ jsonPath, safeNumericCast, operators: value });
  }

  /** The cast belongs to each OPERATOR, not the object: one object-wide cast misses the operand in `{ not: { gt: 50 } }` (-> `text > integer`) and over-casts the extraction `like` shares in `{ gte: 1, like: '%a%' }` (-> `numeric ~~ text`). */
  protected buildJsonOperatorConditions(opts: {
    jsonPath: string;
    safeNumericCast: string;
    operators: Record<string, any>;
  }): SQL[] {
    const { jsonPath, safeNumericCast, operators } = opts;
    const conditions: SQL[] = [];

    for (const op in operators) {
      const operand = operators[op];

      if (op === QueryOperators.NOT) {
        const nested = this.isOperatorObject({ value: operand })
          ? this.buildJsonOperatorConditions({ jsonPath, safeNumericCast, operators: operand })
          : [
              this.buildValueCondition({
                column: sql.raw(typeof operand === 'number' ? safeNumericCast : jsonPath),
                value: operand,
              }),
            ];

        conditions.push(not(nested.length === 1 ? nested[0] : and(...nested)!));
        continue;
      }

      const opFn = this.operators[op];
      if (!opFn) {
        throw getError({
          message: `[FilterBuilder][buildJsonOperatorConditions] Invalid query operator | operator: '${op}'`,
        });
      }

      const extraction = this.jsonNeedsNumericCast({ operators: { [op]: operand } })
        ? sql.raw(safeNumericCast)
        : sql.raw(jsonPath);

      const result = opFn({ column: extraction, value: operand });
      if (result) {
        conditions.push(result);
      }
    }

    return conditions;
  }

  protected buildJsonOrderBy(opts: {
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
