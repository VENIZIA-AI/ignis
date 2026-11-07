import { EchoUtility } from '@/common/internal';
import { ScopeThroughLink } from '../common/scope-through';
import { ScopeWriteGuard } from '../common/scope-write-guard';
import type {
  TDrizzleQueryOptions,
  TFields,
  TFilter,
  TInclusion,
  IModelAccessThroughSettings,
  TModelAccessSettings,
  TParsedOrderEntry,
  TQueryOperatorHandlers,
  TScopeOperation,
  TSortDirection,
  TWhere,
} from '@venizia/ignis-kernel';
import {
  DEFAULT_LIMIT,
  QueryOperators,
  RelationTypes,
  ScopeFilterMissingBehaviors,
  ScopeFilters,
  ScopeOperations,
  Sorts,
} from '@venizia/ignis-kernel';
import type { TTableObject, TTableSchemaWithId } from '@/relational/core/models/common';
import { type MetadataRegistry } from '@venizia/ignis-kernel';
import type { TConstValue, TNullable } from '@venizia/ignis-helpers/common';
import { BaseHelper, getError } from '@venizia/ignis-helpers/core';
import { ObjectUtility } from '@venizia/ignis-helpers/common';
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
  type AnyColumn,
  type SQL,
  type SQLWrapper,
} from 'drizzle-orm';
import type { TRelationConfig, TTableColumns } from '../common';
import { ScopeFilterDenial, ScopeResolution, TableColumnCache } from '../common';
import { DateOperandUtility, JsonPathUtility } from './internal';

/** Operators whose scalar operand determines the JSON numeric-cast need in jsonNeedsNumericCast. */
/** What one registry lookup yields - named so the three setting readers can accept an already-resolved entry instead of each repeating the lookup. */
type TResolvedModelEntry = ReturnType<MetadataRegistry['getModelEntry']>;

/** Most order entries an instance remembers; entries come from requests, so the cache is bounded. */
const ORDER_ENTRY_CACHE_CAP = 1024;

/** Longest order entry the cache keeps, so its memory is bounded by bytes as well as by count. */
const ORDER_ENTRY_CACHE_MAX_LENGTH = 256;

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

/** Operators whose one operand is a single value to compare. */
const DATE_SCALAR_OPERATORS = new Set<string>([
  QueryOperators.EQ,
  QueryOperators.NE,
  QueryOperators.NEQ,
  QueryOperators.GT,
  QueryOperators.GTE,
  QueryOperators.LT,
  QueryOperators.LTE,
  QueryOperators.IS,
  QueryOperators.IS_NOT,
]);

/** Operators whose operand is a list of values (or, for the membership ones, a single value). */
const DATE_LIST_OPERATORS = new Set<string>([
  QueryOperators.IN,
  QueryOperators.INQ,
  QueryOperators.NIN,
  QueryOperators.BETWEEN,
  QueryOperators.NOT_BETWEEN,
]);

/** Keys of a caller's `where` that name no column and would act on the object instead: refused as unknown columns. */
const UNSAFE_WHERE_KEYS: ReadonlySet<string> = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Converts filter objects into Drizzle query options (where, order, columns, relations). The
 * operator table and both JSON extractions are abstract rather than defaulted, so this tier
 * emits no engine-specific SQL.
 */
// No `implements IRelationalQueryDialect` here: that clause belongs on each engine's query dialect,
// which adds the JSON-path update methods.
export abstract class FilterBuilder extends BaseHelper {
  /**
   * Per-schema memo of resolved relations. `@model` settings are
   * immutable after boot, so the lookup and resolver run once per schema.
   */
  private readonly _relationsCache = new WeakMap<
    TTableSchemaWithId,
    Record<string, TRelationConfig>
  >();

  /** `asc`/`desc` allocate an SQL node (~75 ns) that drizzle never mutates - built once per column or expression. */
  private readonly _orderNodeCache = new WeakMap<AnyColumn | SQLWrapper, { asc: SQL; desc: SQL }>();

  /** A freshly sliced field is hashed again on every column lookup; a remembered one is hashed once. */
  private readonly _orderEntryCache = new Map<string, TParsedOrderEntry>();

  constructor() {
    super({ scope: FilterBuilder.name });
  }

  /** Handler table for `where` translation. Abstract so this class names no engine. */
  protected abstract get operators(): TQueryOperatorHandlers;

  /**
   * Holds `userFilter` to the row scope: the scope and the caller's `where` are ANDed, never merged by key, so a
   * scope written as `{ tenantId: 'a' }` holds against a caller's `where: { tenantId: 'b' }` whatever the shapes.
   * The caller can only narrow a scope. Every other part of the filter (order, limit, fields, include) is the caller's.
   */
  composeScope<T = any>(opts: { scopeWhere: TWhere<T>; userFilter?: TFilter<T> }): TFilter<T> {
    const { scopeWhere, userFilter } = opts;
    const userWhere = userFilter?.where;
    const anded: TWhere = { and: [scopeWhere, userWhere ?? {}] };
    const hasUserWhere = !!userWhere && Object.keys(userWhere).length > 0;

    return {
      ...userFilter,
      where: hasUserWhere ? anded : scopeWhere,
    };
  }

  /**
   * Merges default and user filters. `where` merges at the TOP KEY LEVEL, never index-wise - that
   * corrupts operator arrays. Every collision AND-composes, scalars included (equal scalars collapse to one condition),
   * so a default can only be narrowed, and a user `undefined` never overrides a defined default. A key that would
   * change the merged object's prototype (`__proto__`, `constructor`, `prototype`) is refused. Other parts user-wins.
   */
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

  /**
   * Top-key merge: every collision of a key both sides constrain AND-composes under the reserved `and` key
   * (merging with an existing `and` rather than clobbering it), so a caller's `where` can only narrow the default
   * and never replace it: a caller cannot ask for `deletedAt: { not: null }` and read the rows the default hides.
   * A caller's value equal to the default's scalar is a no-op. A server that needs the rows the default hides says so
   * with `shouldSkipDefaultFilter`, which is not on the wire schema.
   */
  private mergeWhere<T = any>(opts: { defaultWhere: TWhere<T>; userWhere: TWhere<T> }): TWhere<T> {
    const { defaultWhere, userWhere } = opts;

    // Read by runtime key, which the column-keyed `TWhere<T>` does not index.
    const defaults: TWhere = defaultWhere;
    const users: TWhere = userWhere;

    const merged: TWhere = { ...defaultWhere };
    const composed: TWhere[] = [];

    for (const key in users) {
      const userValue = users[key];

      if (userValue === undefined) {
        continue;
      }

      // `merged[key] = ...` with one of these would change the merged object's prototype, not set a condition.
      if (UNSAFE_WHERE_KEYS.has(key)) {
        throw getError({
          message: `[FilterBuilder][mergeWhere] Column NOT FOUND | key: '${EchoUtility.toSafeEcho({ value: key })}'`,
        });
      }

      // An OWN property only: `toString` or `valueOf` on a plain object is the prototype's function, not a default.
      const defaultValue = Object.hasOwn(defaults, key) ? defaults[key] : undefined;

      // A collision AND-composes, scalars included: scalar-over-scalar used to be a plain override, which let a
      // caller replace the soft-delete default (`deletedAt: null`) and read deleted rows.
      const isCollision = defaultValue !== undefined;

      // `and`/`or` are how a SCOPE is written and both sides are arrays, which `isPrimitiveValue`
      // counts as scalar - without these branches the caller's group replaces the default outright.
      if (isCollision && key === QueryOperators.AND) {
        // Both conjunct lists must hold: concatenating them IS the AND of the two groups.
        merged.and = [...defaultValue, ...userValue];
        continue;
      }

      if (isCollision && key === QueryOperators.OR) {
        // Two disjunctions cannot be concatenated - that would UNION them, widening
        // the query. Each group has to hold on its own, so they become two conjuncts.
        delete merged[key];
        composed.push({ [key]: defaultValue }, { [key]: userValue });
        continue;
      }

      if (isCollision) {
        // The caller restating the default changes nothing: keep the one condition, not two equal ones.
        if (this.isSameScalar({ left: defaultValue, right: userValue })) {
          continue;
        }

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

  /** Two values that are the same scalar: equal primitives (`null` included) or the same instant. Operator objects and lists are never "the same": they compose. */
  private isSameScalar(opts: { left: unknown; right: unknown }): boolean {
    const { left, right } = opts;

    if (left instanceof Date && right instanceof Date) {
      return left.getTime() === right.getTime();
    }

    const isPrimitive = (value: unknown) => value === null || typeof value !== 'object';

    return isPrimitive(left) && isPrimitive(right) && Object.is(left, right);
  }

  /**
   * Registry lookup shared by the resolvers below. A failure degrades to no settings rather than
   * failing the query, and is never silent - a degraded `resolveHiddenProperties` would stop
   * hidden columns being omitted.
   */
  private resolveModelEntry(opts: { schema: TTableSchemaWithId; methodName: string }) {
    const { schema, methodName } = opts;

    try {
      return ScopeThroughLink.entryOf({ schema });
    } catch (error) {
      this.logger.warn(
        '[%s] Model metadata lookup failed - continuing without model settings | %s',
        methodName,
        error,
      );

      return undefined;
    }
  }

  /**
   * Resolves hidden properties from the relation's SCHEMA object, falling back to its SQL table name -
   * `toInclude` has the schema and no class reference. A table claimed by two models answers by name
   * only, since the schema no longer names one of them.
   */
  resolveHiddenProperties(opts: {
    schema: TTableSchemaWithId;
    modelEntry?: TResolvedModelEntry;
  }): Set<string> {
    const modelEntry =
      opts.modelEntry ??
      this.resolveModelEntry({ schema: opts.schema, methodName: 'resolveHiddenProperties' });

    return new Set(modelEntry?.metadata?.settings?.hiddenProperties ?? []);
  }

  /** Resolves default filter for a schema from MetadataRegistry. */
  resolveDefaultFilter(opts: {
    schema: TTableSchemaWithId;
    modelEntry?: TResolvedModelEntry;
  }): TFilter | undefined {
    const modelEntry =
      opts.modelEntry ??
      this.resolveModelEntry({ schema: opts.schema, methodName: 'resolveDefaultFilter' });

    return modelEntry?.metadata?.settings?.query?.filter;
  }

  /** Resolves row-scope settings for a schema from MetadataRegistry - the relation's OWN `@model` entry, never the parent's. */
  resolveScopeFilter(opts: {
    schema: TTableSchemaWithId;
    modelEntry?: TResolvedModelEntry;
  }): TModelAccessSettings | undefined {
    const modelEntry =
      opts.modelEntry ??
      this.resolveModelEntry({ schema: opts.schema, methodName: 'resolveScopeFilter' });

    return modelEntry?.metadata?.settings?.access;
  }

  /**
   * The foreign key link of a `through` model and the scope its parent resolves for `operation` (the same operation
   * at every hop). The parent's default filter is not applied: scope only. For a write the parent's scope is narrowed as a
   * direct write to the parent is (`ScopeWriteGuard.mutationWhere`), so its `write.sharedRows` holds on the hop.
   */
  resolveThrough(opts: {
    settings: IModelAccessThroughSettings;
    schema: TTableSchemaWithId;
    operation: TScopeOperation;
    depth?: number;
  }): {
    link: ReturnType<typeof ScopeThroughLink.of>;
    scope: TNullable<TWhere> | typeof ScopeFilters.UNRESTRICTED;
  } {
    const { settings, schema, operation, depth = 1 } = opts;

    if (depth > ScopeThroughLink.MAX_DEPTH) {
      throw getError({
        message: `[resolveThrough] access.through is deeper than ${ScopeThroughLink.MAX_DEPTH} hops at ${getTableName(schema)}`,
      });
    }

    const link = ScopeThroughLink.of({
      schema,
      relation: settings.through.relation,
      relations: this.resolveRelations({ schema }),
    });
    const parentSettings = link.parentEntry?.metadata?.settings?.access;

    if (!parentSettings) {
      throw getError({
        message: `[resolveThrough] ${getTableName(link.parentSchema)} has no access setting, so ${getTableName(schema)} cannot be scoped through it`,
      });
    }

    const parentScope = this.resolveAccessScope({
      settings: parentSettings,
      schema: link.parentSchema,
      operation,
      depth: depth + 1,
    });

    // A write to the child reaches the parent the way a write to the parent itself does: the shared (null) rows its read scope
    // opens need the parent's `write.sharedRows`. A parent that is itself `through` narrowed its own parent on its hop.
    const isNarrowed =
      ScopeOperations.includes({ group: ScopeOperations.WRITE, operation }) &&
      !parentSettings.through &&
      parentScope !== ScopeFilters.UNRESTRICTED &&
      parentScope !== null &&
      parentScope !== undefined;
    const scope = isNarrowed
      ? ScopeWriteGuard.mutationWhere({
          settings: parentSettings,
          model: getTableName(link.parentSchema),
          operation,
          scopeWhere: parentScope,
        })
      : parentScope;

    return { link, scope };
  }

  /** The parent's scope as a `where` on the parent table: the part both the read subquery and the write check build. */
  toParentWhere(opts: { link: ReturnType<typeof ScopeThroughLink.of>; scope: TWhere }) {
    const { link, scope } = opts;

    return this.toWhere({
      tableName: getTableName(link.parentSchema),
      schema: link.parentSchema,
      where: scope,
    });
  }

  /**
   * The scope of a model for one call. A `through` model keeps the child rows whose foreign key is in the set of
   * parent keys the parent's scope allows: `child.fk IN (SELECT parent.pk FROM parent WHERE <parent scope>)`, built with
   * the existing `inSql` operator.
   */
  resolveAccessScope(opts: {
    settings: TModelAccessSettings;
    schema: TTableSchemaWithId;
    operation: TScopeOperation;
    depth?: number;
  }): TNullable<TWhere> | typeof ScopeFilters.UNRESTRICTED {
    const { settings, schema, operation, depth } = opts;

    if (!settings.through) {
      return ScopeResolution.normalize({ value: settings.resolve({ operation }) });
    }

    const { link, scope } = this.resolveThrough({ settings, schema, operation, depth });

    if (scope === ScopeFilters.UNRESTRICTED || scope === null || scope === undefined) {
      return scope;
    }

    const where = this.toParentWhere({ link, scope });
    const keys = sql`select ${link.parentColumn} from ${link.parentSchema}`;
    const subquery = where ? sql`${keys} where ${where}` : keys;

    // Opaque on purpose: drizzle's relational query rewrites every column it finds in a `where` to the relation's alias,
    // the parent's columns inside this subquery included. A wrapper it does not look into keeps them qualified.
    return { [link.childProperty]: { inSql: { getSQL: () => subquery } } };
  }

  /**
   * Row scope for an included relation, mirroring `applyScopeFilter` in the repository tier
   * exactly: unconditional - never gated by `shouldSkipDefaultFilter` - and deny-by-default when
   * `resolve()` cannot determine a scope. A throwing `resolve()` is never caught here, so it
   * propagates the same way it does on the parent.
   */
  private applyRelationScopeFilter(opts: {
    userFilter?: TFilter;
    scopeFilterSettings?: TModelAccessSettings;
    schema: TTableSchemaWithId;
  }): TFilter {
    const { userFilter, scopeFilterSettings, schema } = opts;

    if (!scopeFilterSettings) {
      return userFilter ?? {};
    }

    const scopeWhere = this.resolveAccessScope({
      settings: scopeFilterSettings,
      schema,
      operation: ScopeOperations.READ,
    });

    // Same ordering as the repository tier's `applyScopeFilter`: exact symbol identity, checked
    // before null/undefined, so a forgotten `return` (which produces `undefined`) still denies
    // rather than un-scoping this relation. Each relation resolves its OWN `scopeFilterSettings`, so
    // an unrestricted parent never widens a still-scoped child, and vice versa.
    if (scopeWhere === ScopeFilters.UNRESTRICTED) {
      return userFilter ?? {};
    }

    if (scopeWhere !== null && scopeWhere !== undefined) {
      return this.composeScope({ scopeWhere, userFilter });
    }

    if (scopeFilterSettings.onMissing === ScopeFilterMissingBehaviors.ALLOW) {
      return userFilter ?? {};
    }

    return this.composeScope({ scopeWhere: ScopeFilterDenial.where(), userFilter });
  }

  /** Resolves default row limit for a schema from MetadataRegistry. */
  resolveDefaultLimit(opts: {
    schema: TTableSchemaWithId;
    modelEntry?: TResolvedModelEntry;
  }): number | undefined {
    const modelEntry =
      opts.modelEntry ??
      this.resolveModelEntry({ schema: opts.schema, methodName: 'resolveDefaultLimit' });

    return modelEntry?.metadata?.settings?.query?.limit?.default;
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
      return ScopeThroughLink.relationsOf({ entry: modelEntry });
    } catch (error) {
      this.logger.warn(
        '[resolveRelationsUncached] Relations resolver failed - continuing without relations | %s',
        error,
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
        // Plain assignment, not `lodash/set`: drizzle's `columns` is a FLAT map of column name to
        // boolean, so a dotted field would have nested into a shape it cannot read anyway.
        // `String`, because `keyof any` admits a symbol and drizzle keys by name - which is what
        // `lodash/set` did internally with every path part anyway.
        result[String(field)] = true;
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

  /**
   * Converts a where clause to a Drizzle SQL condition (supports operators, JSON paths, AND/OR).
   */
  toWhere<Schema extends TTableSchemaWithId>(opts: {
    tableName: string;
    schema: Schema;
    where: TWhere<TTableObject<Schema>>;
  }): SQL | undefined {
    const { tableName, schema, where } = opts;
    const columns = this.getColumns(schema);

    if (!columns || ObjectUtility.isEmpty({ value: columns })) {
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

  /**
   * Conditions contributed by a single where key: a logical
   * group, a JSON path, a bare value or an operator object.
   */
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

    if (JsonPathUtility.isJsonPath({ key })) {
      return this.buildJsonWhereCondition({ key, value, columns, tableName });
    }

    // An OWN column only: `constructor` or `toString` on the columns object is the prototype's function, not a column.
    const column = Object.hasOwn(columns, key) ? columns[key] : undefined;

    if (!column) {
      throw this.columnNotFoundError({ kind: 'where', key, tableName });
    }

    const operand = DateOperandUtility.isDateColumn({ column })
      ? this.toDateOperand({ value, key, tableName })
      : value;

    if (!this.isOperatorObject({ value: operand })) {
      return [this.buildValueCondition({ column, value: operand })];
    }

    return this.buildOperatorConditions({ column, value: operand });
  }

  /**
   * A `where` value for a column Drizzle maps from a `Date`, with every string or number in it parsed to a `Date`.
   * `null` stays `null`; anything that is no timestamp is a 400.
   */
  private toDateOperand(opts: { value: any; key: string; tableName: string }): any {
    const { value, key, tableName } = opts;

    if (value === null) {
      return null;
    }

    if (Array.isArray(value)) {
      return this.toDateList({ values: value, key, tableName });
    }

    if (!this.isOperatorObject({ value })) {
      return DateOperandUtility.toDate({ value, key, tableName });
    }

    const result: Record<string, any> = {};

    for (const op in value) {
      const operand = value[op];

      if (op === QueryOperators.NOT) {
        result[op] = this.toDateOperand({ value: operand, key, tableName });
        continue;
      }

      if (DATE_SCALAR_OPERATORS.has(op)) {
        result[op] =
          operand === null ? null : DateOperandUtility.toDate({ value: operand, key, tableName });
        continue;
      }

      if (DATE_LIST_OPERATORS.has(op)) {
        result[op] = Array.isArray(operand)
          ? this.toDateList({ values: operand, key, tableName })
          : this.toDateMembershipOperand({ op, operand, key, tableName });
        continue;
      }

      result[op] = operand;
    }

    return result;
  }

  private toDateList(opts: { values: any[]; key: string; tableName: string }): any[] {
    const { values, key, tableName } = opts;

    // A `null` element is passed on as the SQL NULL it is, which compares as UNKNOWN, as it does for any column.
    return values.map((value) =>
      value === null ? null : DateOperandUtility.toDate({ value, key, tableName }),
    );
  }

  /** A list operator given something that is no list: the membership operators read it as one value, `between` leaves its own refusal to the operator. */
  private toDateMembershipOperand(opts: {
    op: string;
    operand: any;
    key: string;
    tableName: string;
  }): any {
    const { op, operand, key, tableName } = opts;

    if (op === QueryOperators.BETWEEN || op === QueryOperators.NOT_BETWEEN || operand === null) {
      return operand;
    }

    return DateOperandUtility.toDate({ value: operand, key, tableName });
  }

  /**
   * Converts order entries to Drizzle SQL order nodes. A key resolves against `expressions` first
   * (a joined column or a computed `SQL`), then as a JSON path, then as a schema column.
   */
  toOrderBy<Schema extends TTableSchemaWithId>(opts: {
    tableName: string;
    schema: Schema;
    order: string[];
    expressions?: Readonly<Record<string, AnyColumn | SQLWrapper>>;
  }): SQL[] {
    const { tableName, schema, order, expressions } = opts;

    if (!Array.isArray(order) || order.length === 0) {
      return [];
    }

    const columns = this.getColumns(schema);

    const idColumn = columns.id;
    const orderBy: SQL[] = [];
    let namesId = false;

    for (const entry of order) {
      const { field: key, direction } = this.readOrderEntry({ entry });

      // The key comes from the request: an inherited name like `constructor` must not resolve.
      if (expressions && Object.hasOwn(expressions, key)) {
        orderBy.push(this.getOrderNode({ target: expressions[key], direction }));
        continue;
      }

      if (JsonPathUtility.isJsonPath({ key })) {
        orderBy.push(this.buildJsonOrderBy({ key, direction, columns, tableName }));
        continue;
      }

      const column = Object.hasOwn(columns, key) ? columns[key] : undefined;

      if (!column) {
        throw this.columnNotFoundError({ kind: 'order', key, tableName });
      }

      namesId ||= column === idColumn;
      orderBy.push(this.getOrderNode({ target: column, direction }));
    }

    // A tie left to the engine is broken per page, so paging repeats and skips rows.
    if (idColumn && !namesId) {
      orderBy.push(this.getOrderNode({ target: idColumn, direction: Sorts.ASC }));
    }

    return orderBy;
  }

  private readOrderEntry(opts: { entry: string }): TParsedOrderEntry {
    const { entry } = opts;
    let parsed = this._orderEntryCache.get(entry);

    if (!parsed) {
      parsed = Sorts.parseEntry({ entry });

      if (entry.length <= ORDER_ENTRY_CACHE_MAX_LENGTH) {
        // Clearing, not evicting the oldest: deleting from the front of a JSC Map is slow.
        if (this._orderEntryCache.size >= ORDER_ENTRY_CACHE_CAP) {
          this._orderEntryCache.clear();
        }

        this._orderEntryCache.set(entry, parsed);
      }
    }

    return parsed;
  }

  private getOrderNode(opts: { target: AnyColumn | SQLWrapper; direction: TSortDirection }): SQL {
    const { target, direction } = opts;
    let pair = this._orderNodeCache.get(target);

    if (!pair) {
      pair = { asc: asc(target), desc: desc(target) };
      this._orderNodeCache.set(target, pair);
    }

    return direction === Sorts.DESC ? pair.desc : pair.asc;
  }

  /**
   * Converts include clause to Drizzle 'with' options
   * with nested filtering and hidden prop exclusion.
   */
  toInclude(opts: {
    include: TInclusion[];
    relations: { [relationName: string]: TRelationConfig };
  }): Record<string, true | TDrizzleQueryOptions> {
    const { include, relations } = opts;
    const result: Record<string, true | TDrizzleQueryOptions> = {};

    for (const inc of include) {
      const relationName = typeof inc === 'string' ? inc : inc?.relation;
      const scope = typeof inc === 'string' ? undefined : inc?.scope;
      const shouldSkipDefaultFilter =
        typeof inc === 'string' ? false : inc?.shouldSkipDefaultFilter;

      // A name that is not a non-empty string (`['zzz']`, `42`, `{}`) is a malformed include: a 400 here, not a TypeError further down.
      if (typeof relationName !== 'string' || !relationName) {
        throw getError({
          message: `[FilterBuilder][toInclude] Invalid include format | include: ${JSON.stringify(inc)}`,
        });
      }

      // Own properties only: `constructor` or `toString` is not a relation, and an inherited function would fail later as an internal error.
      const relationConfig = Object.hasOwn(relations, relationName)
        ? relations[relationName]
        : undefined;

      if (!relationConfig) {
        throw getError({
          message: `[FilterBuilder][toInclude] Relation NOT FOUND | relation: '${EchoUtility.toSafeEcho({ value: relationName })}'`,
        });
      }

      // Resolved ONCE and handed to all four readers: they ask the registry the same question
      // about the same schema, and the lookup - `getTableName` plus a registry read - is the
      // measured cost of this loop, not the reads off the entry.
      const modelEntry = this.resolveModelEntry({
        schema: relationConfig.schema,
        methodName: 'toInclude',
      });

      const hiddenProps = this.resolveHiddenProperties({
        schema: relationConfig.schema,
        modelEntry,
      });

      // Row scope is this relation's OWN `@model` setting - never the parent's - and is applied
      // LAST and outermost, after the default filter, so it survives `shouldSkipDefaultFilter` exactly like the parent and
      // the caller's `scope.where` (composed with the default filter, never replacing it) can only narrow it.
      const scopeFilterSettings = this.resolveScopeFilter({
        schema: relationConfig.schema,
        modelEntry,
      });

      const defaultFilter = shouldSkipDefaultFilter
        ? undefined
        : this.resolveDefaultFilter({ schema: relationConfig.schema, modelEntry });

      const mergedScope = this.applyRelationScopeFilter({
        userFilter: this.mergeFilter({ defaultFilter, userFilter: scope }),
        scopeFilterSettings,
        schema: relationConfig.schema,
      });
      const scopedFilter: TFilter =
        relationConfig.type === RelationTypes.MANY
          ? {
              ...mergedScope,
              limit:
                mergedScope.limit ??
                this.resolveDefaultLimit({ schema: relationConfig.schema, modelEntry }) ??
                DEFAULT_LIMIT,
            }
          : mergedScope;

      const hasNoEffectiveFilter =
        ObjectUtility.isEmpty({ value: scopedFilter }) || Object.keys(scopedFilter).length === 0;

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

  /**
   * Column selection with hidden properties removed;
   * a nullish `columns` means "every schema column".
   */
  private omitHiddenColumns(opts: {
    columns?: Record<string, boolean>;
    schema: TTableSchemaWithId;
    hiddenProps: Set<string>;
  }): Record<string, boolean> {
    const { columns, schema, hiddenProps } = opts;
    const source = columns ?? TableColumnCache.get(schema);
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
    return TableColumnCache.get(schema);
  }

  private isPrimitiveValue(opts: { value: any }): boolean {
    const { value } = opts;

    return (
      value === null || Array.isArray(value) || value instanceof Date || typeof value !== 'object'
    );
  }

  /**
   * Protected, not private: an engine overriding `buildJsonWhereCondition` must tell an operator
   * object from a bare value, and cannot reach the base's own walk to do it.
   */
  protected isOperatorObject(opts: { value: any }): boolean {
    const { value } = opts;

    if (this.isPrimitiveValue({ value })) {
      return false;
    }

    const keys = Object.keys(value);

    if (keys.length === 0) {
      return false;
    }

    return keys.every((key) => QueryOperators.isValid(key));
  }

  /**
   * Builds a SQL condition for a simple value (null, array, or
   * equality). Protected for the same reason as `isOperatorObject`: an
   * overridden `buildJsonWhereCondition` needs the bare-value branch.
   */
  protected buildValueCondition(opts: { column: any; value: any }): SQL {
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
      // `not` recurses into a nested condition, out of reach of the static operator handlers
      // - built here where buildOperatorConditions and buildValueCondition are in scope.
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

  /**
   * Negates a nested condition: `not: <operatorObject>` recurses into the
   * operators, `not: <bareValue>` negates that value equality/array/null condition.
   */
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
      .map((inner) => this.toWhere({ tableName, schema, where: inner }))
      .filter((c): c is SQL => !!c);

    if (clauses.length === 0) {
      // An empty conjunction is vacuously TRUE so dropping it is correct, but an empty DISJUNCTION
      // is FALSE and dropping it WIDENS the query: `or: permittedOrgIds.map(...)` on an empty
      // permission list must return nothing, not everything.
      return key === QueryOperators.AND ? undefined : sql`false`;
    }

    return key === QueryOperators.AND ? and(...clauses)! : or(...clauses)!;
  }

  /** The refusal of a key that names no column, as the query words it. One builder, so a refusal made before the query (a request guard) is the very same text. */
  protected columnNotFoundMessage(opts: { method: string; tableName: string; key: string }): Error {
    return getError({
      message: `[FilterBuilder][${opts.method}] Table: ${opts.tableName} | Column NOT FOUND | key: '${EchoUtility.toSafeEcho({ value: opts.key })}'`,
    });
  }

  /**
   * The error the query gives for a `where` key or an `order` field that names no column: a JSON path is judged by its first
   * part, with the JSON method's wording, and any other key by itself. A request guard throws it for a hidden field, so a caller
   * cannot tell a hidden column from one that does not exist.
   */
  columnNotFoundError(opts: { kind: 'where' | 'order'; key: string; tableName: string }): Error {
    const { kind, key, tableName } = opts;
    const isJson = JsonPathUtility.isJsonPath({ key });
    const method = isJson
      ? kind === 'where'
        ? 'buildJsonWhereCondition'
        : 'buildJsonOrderBy'
      : kind === 'where'
        ? 'toWhere'
        : 'toOrderBy';

    return this.columnNotFoundMessage({
      method,
      tableName,
      key: isJson ? JsonPathUtility.parseJsonPath({ key }).columnName : key,
    });
  }

  protected validateJsonColumn(opts: {
    key: string;
    columns: TTableColumns;
    tableName: string;
    methodName: string;
  }): { column: TTableColumns[string]; path: string[] } {
    const { key, columns, tableName, methodName } = opts;

    const parsed = JsonPathUtility.parseJsonPath({ key });

    const column = Object.hasOwn(columns, parsed.columnName)
      ? columns[parsed.columnName]
      : undefined;

    if (!column) {
      throw this.columnNotFoundMessage({ method: methodName, tableName, key: parsed.columnName });
    }

    JsonPathUtility.validateJsonColumnType({
      column,
      columnName: parsed.columnName,
      tableName,
      methodName: `FilterBuilder.${methodName}`,
    });

    JsonPathUtility.validateJsonPathComponents({
      path: parsed.path,
      tableName,
      methodName: `FilterBuilder.${methodName}`,
    });

    return { column, path: parsed.path };
  }

  /**
   * Whether a JSON operand needs the engine's numeric extraction: numeric comparisons, eq/ne/neq
   * with a number, in/inq/nin with an all-number array. Only picks between the two fragments the
   * engine passed in, so an engine with already-typed extraction returns false.
   */
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
        operand.every((entry) => typeof entry === 'number')
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * Emits the engine JSON extraction for one where key. Abstract because the syntax is
   * engine-owned: a default would hand the next engine one branch's SQL with no compile error.
   */
  protected abstract buildJsonWhereCondition(opts: {
    key: string;
    value: any;
    columns: TTableColumns;
    tableName: string;
  }): SQL[];

  /**
   * A bare JSON operand IS its operator equivalent - `isOperatorObject` counts an array
   * as primitive, so `[10, 20]` must take the same cast `{ inq: [10, 20] }` does.
   */
  protected toBareJsonOperators(opts: { value: any }): Record<string, any> {
    const { value } = opts;

    return Array.isArray(value) ? { [QueryOperators.INQ]: value } : { [QueryOperators.EQ]: value };
  }

  /**
   * The cast belongs to each OPERATOR, not the object: one object-wide cast misses the operand in
   * `{ not: { gt: 50 } }` (-> `text > integer`) and over-casts the extraction `like` shares in
   * `{ gte: 1, like: '%a%' }` (-> `numeric ~~ text`).
   */
  protected buildJsonOperatorConditions(opts: {
    jsonPath: string | SQL;
    safeNumericCast: string | SQL;
    operators: Record<string, any>;
  }): SQL[] {
    const { operators } = opts;
    // Raw text stays accepted for subclasses; wrapped once so every operator shares one fragment.
    const jsonPath = typeof opts.jsonPath === 'string' ? sql.raw(opts.jsonPath) : opts.jsonPath;
    const safeNumericCast =
      typeof opts.safeNumericCast === 'string'
        ? sql.raw(opts.safeNumericCast)
        : opts.safeNumericCast;
    const conditions: SQL[] = [];

    for (const op in operators) {
      const operand = operators[op];

      if (op === QueryOperators.NOT) {
        if (this.isOperatorObject({ value: operand })) {
          const nested = this.buildJsonOperatorConditions({
            jsonPath,
            safeNumericCast,
            operators: operand,
          });

          conditions.push(not(nested.length === 1 ? nested[0] : and(...nested)!));
          continue;
        }

        // The choice must come from `jsonNeedsNumericCast`, never a bare `typeof`: an engine that
        // neutralises the cast by overriding the predicate would still be cast through this branch.
        const negatedExtraction = this.jsonNeedsNumericCast({
          operators: this.toBareJsonOperators({ value: operand }),
        })
          ? safeNumericCast
          : jsonPath;

        conditions.push(
          not(this.buildValueCondition({ column: negatedExtraction, value: operand })),
        );
        continue;
      }

      const opFn = this.operators[op];

      if (!opFn) {
        throw getError({
          message: `[FilterBuilder][buildJsonOperatorConditions] Invalid query operator | operator: '${op}'`,
        });
      }

      const extraction = this.jsonNeedsNumericCast({ operators: { [op]: operand } })
        ? safeNumericCast
        : jsonPath;

      const result = opFn({ column: extraction, value: operand });

      if (result) {
        conditions.push(result);
      }
    }

    return conditions;
  }

  /**
   * Emits the engine's JSON extraction for one order key.
   * Abstract for the same reason as `buildJsonWhereCondition`.
   */
  protected abstract buildJsonOrderBy(opts: {
    key: string;
    direction: TConstValue<typeof Sorts>;
    columns: TTableColumns;
    tableName: string;
  }): SQL;
}
