import type { IdType } from '@/base/models';
import type {
  IExtraOptions,
  TCount,
  TDataRange,
  TFilter,
  TWhere,
} from '@/base/repositories/common';
import {
  buildDataRange,
  DEFAULT_LIMIT,
  RepositoryOperationScopes,
} from '@/base/repositories/common';
import type { IPostgresDataSource } from '@/connectors/postgres/datasources';
import type {
  BaseRelationalEntity,
  TTableInsert,
  TTableObject,
  TTableSchemaWithId,
} from '@/connectors/postgres/models';
import type { TClass, TNullable } from '@venizia/ignis-helpers';
import omit from 'lodash/omit';
import type { PgTable } from 'drizzle-orm/pg-core';
import type { IDatabaseExtraOptions } from '../common';
import { RelationalBaseRepository } from './base';

/** Read-only repository. Write operations throw errors. */
export class ReadableRelationalRepository<
  EntitySchema extends TTableSchemaWithId = TTableSchemaWithId,
  DataObject extends TTableObject<EntitySchema> = TTableObject<EntitySchema>,
  PersistObject extends TTableInsert<EntitySchema> = TTableInsert<EntitySchema>,
  ExtraOptions extends IExtraOptions = IDatabaseExtraOptions,
> extends RelationalBaseRepository<EntitySchema, DataObject, PersistObject, ExtraOptions> {
  constructor(
    ds?: IPostgresDataSource,
    opts?: { entityClass?: TClass<BaseRelationalEntity<EntitySchema>> },
  ) {
    super(ds, {
      entityClass: opts?.entityClass,
      operationScope: RepositoryOperationScopes.READ_ONLY,
    });
  }
  /** Core API is ~15-20% faster but doesn't support relations or field selection. */
  protected canUseCoreAPI(filter: TFilter<DataObject>): boolean {
    const hasInclude = filter.include && filter.include.length > 0;
    const hasFields =
      filter.fields &&
      (Array.isArray(filter.fields)
        ? filter.fields.length > 0
        : Object.keys(filter.fields).length > 0);
    return !hasInclude && !hasFields;
  }

  /** Executes a query using Drizzle Core API (~15-20% faster for flat queries). */
  protected async findWithCoreAPI<R = DataObject>(opts: {
    filter: TFilter<DataObject>;
    isFindOne?: boolean;
    options?: ExtraOptions;
  }): Promise<Array<R>> {
    const { filter, isFindOne = false, options } = opts;
    const schema = this.entity.schema;

    const mergedFilter = this.applyDefaultFilter({
      userFilter: filter,
      shouldSkipDefaultFilter: options?.shouldSkipDefaultFilter,
    });

    const where = mergedFilter.where
      ? this.queryDialect.toWhere({
          tableName: this.entity.name,
          schema,
          where: mergedFilter.where,
        })
      : undefined;

    const orderBy = mergedFilter.order
      ? this.queryDialect.toOrderBy({
          tableName: this.entity.name,
          schema,
          order: mergedFilter.order,
        })
      : undefined;

    const limit = isFindOne ? 1 : mergedFilter.limit;
    const offset = mergedFilter.skip ?? mergedFilter.offset;

    // EntitySchema extends TTableSchemaWithId (which extends PgTable), but drizzle's `.from()`
    // needs the concrete PgTable type, not the generic bound.
    const table = schema as PgTable;
    const connector = this.resolveConnector({ transaction: options?.transaction });

    const visibleProps = this.getVisibleProperties();
    let query = visibleProps
      ? connector.select(visibleProps).from(table).$dynamic()
      : connector.select().from(table).$dynamic();

    if (where) {
      query = query.where(where);
    }

    if (orderBy && orderBy.length > 0) {
      query = query.orderBy(...orderBy);
    }

    if (limit !== undefined) {
      query = query.limit(limit);
    }

    if (offset !== undefined) {
      query = query.offset(offset);
    }

    // Drizzle's `$dynamic()` query builder infers its row type from the table schema, not from R
    // (the caller-chosen output shape); the two are asserted compatible by convention.
    const lock = opts.options?.lock;
    if (lock) {
      return query.for(lock.strength, lock.config) as Promise<Array<R>>;
    }

    return query as Promise<Array<R>>;
  }

  /** Executes a query using Drizzle Query API (supports relations and field selection). */
  protected async findWithQueryAPI<R = DataObject>(opts: {
    filter: TFilter<DataObject>;
    options?: ExtraOptions;
  }): Promise<Array<R>> {
    const queryOptions = this.buildQuery({ filter: opts.filter });
    const queryInterface = this.getQueryInterface({ options: opts.options });
    // Drizzle's relational query result (`PgRelationalQuery<{[x: string]: any}[]>`) doesn't overlap
    // R (the caller-chosen output shape) enough for a direct assertion - genuinely different shapes
    // being bridged at this ORM boundary.
    return queryInterface.findMany(queryOptions) as any;
  }
  override find<R = DataObject>(opts: {
    filter: TFilter<DataObject>;
    options: ExtraOptions & { shouldQueryRange: true };
  }): Promise<{ data: Array<R>; range: TDataRange }>;

  override find<R = DataObject>(opts: {
    filter: TFilter<DataObject>;
    options?: ExtraOptions & { shouldQueryRange?: false };
  }): Promise<Array<R>>;

  /** Auto-selects Core API or Query API based on filter complexity. */
  override async find<R = DataObject>(opts: {
    filter: TFilter<DataObject>;
    options?: ExtraOptions & { shouldQueryRange?: boolean };
  }): Promise<Array<R> | { data: Array<R>; range: TDataRange }> {
    const { filter, options } = opts;
    const shouldQueryRange = options?.shouldQueryRange === true;

    const baseFilter = this.applyDefaultFilter({
      userFilter: filter,
      shouldSkipDefaultFilter: options?.shouldSkipDefaultFilter,
    });

    const mergedFilter: TFilter<DataObject> = {
      ...baseFilter,
      limit: baseFilter.limit ?? this.getDefaultLimit() ?? DEFAULT_LIMIT,
    };

    // ExtraOptions is caller-bound but otherwise unconstrained; spreading it alongside the literal
    // override can't be proven to still satisfy the generic bound.
    const effectiveOptions = { ...options, shouldSkipDefaultFilter: true } as ExtraOptions;
    const useCoreAPI = this.canUseCoreAPI(mergedFilter);

    this.validateLockOptions({
      lock: options?.lock,
      transaction: options?.transaction,
      usesQueryAPI: !useCoreAPI,
    });

    const dataPromise = useCoreAPI
      ? this.findWithCoreAPI<R>({ filter: mergedFilter, options: effectiveOptions })
      : this.findWithQueryAPI<R>({ filter: mergedFilter, options: effectiveOptions });

    if (!shouldQueryRange) {
      return dataPromise;
    }

    // A transaction connector wraps a single pg client, so parallel data+count queries would call
    // client.query() while it's still busy (pg deprecation warning) - only safe outside a transaction.
    const countPromise = () =>
      this.count({ where: mergedFilter.where ?? {}, options: effectiveOptions });

    let data: Array<R>;
    let total: number;

    if (effectiveOptions.transaction) {
      data = await dataPromise;
      ({ count: total } = await countPromise());
    } else {
      [data, { count: total }] = await Promise.all([dataPromise, countPromise()]);
    }

    return {
      data,
      range: buildDataRange({
        skip: mergedFilter.skip,
        offset: mergedFilter.offset,
        dataLength: data.length,
        total,
      }),
    };
  }

  /** Auto-selects Core API or Query API based on filter complexity. */
  override async findOne<R = DataObject>(opts: {
    filter: TFilter<DataObject>;
    options?: ExtraOptions;
  }): Promise<TNullable<R>> {
    const filter = opts.filter;
    const useCoreAPI = this.canUseCoreAPI(filter);

    this.validateLockOptions({
      lock: opts?.options?.lock,
      transaction: opts?.options?.transaction,
      usesQueryAPI: !useCoreAPI,
    });

    if (useCoreAPI) {
      const results = await this.findWithCoreAPI<R>({
        filter,
        isFindOne: true,
        options: opts?.options,
      });
      return results[0] ?? null;
    }

    const mergedFilter = this.applyDefaultFilter({
      userFilter: filter,
      shouldSkipDefaultFilter: opts?.options?.shouldSkipDefaultFilter,
    });

    const queryOptions = omit(this.buildQuery({ filter: mergedFilter }), ['limit']);
    const queryInterface = this.getQueryInterface({ options: opts?.options });
    const result = await queryInterface.findFirst(queryOptions);
    // Same drizzle-relational-query-vs-caller-generic boundary as findWithQueryAPI above.
    return (result ?? null) as TNullable<R>;
  }

  /** Delegates to findOne with id in the where clause. */
  override findById<R = DataObject>(opts: {
    id: IdType;
    filter?: Omit<TFilter<DataObject>, 'where'>;
    options?: ExtraOptions;
  }): Promise<TNullable<R>> {
    return this.findOne<R>({
      filter: {
        ...opts.filter,
        where: { id: opts.id },
      },
      options: opts.options,
    });
  }
  override async count(opts: {
    where: TWhere<DataObject>;
    options?: ExtraOptions;
  }): Promise<TCount> {
    const mergedFilter = this.applyDefaultFilter({
      userFilter: { where: opts.where },
      shouldSkipDefaultFilter: opts.options?.shouldSkipDefaultFilter,
    });

    const where = this.queryDialect.toWhere({
      tableName: this.entity.name,
      schema: this.entity.schema,
      where: mergedFilter.where ?? {},
    });

    const connector = this.resolveConnector({ transaction: opts.options?.transaction });
    const count = await connector.$count(this.entity.schema, where);
    return { count };
  }

  override async existsWith(opts: {
    where: TWhere<DataObject>;
    options?: ExtraOptions;
  }): Promise<boolean> {
    const rs = await this.count(opts);
    return rs.count > 0;
  }
  /** @throws Error - disabled in read-only repository. */
  override create(opts: {
    data: PersistObject;
    options: ExtraOptions & { shouldReturn: false };
  }): Promise<TCount & { data: undefined | null }>;
  override create(opts: {
    data: PersistObject;
    options?: ExtraOptions & { shouldReturn?: true };
  }): Promise<TCount & { data: DataObject }>;
  override create(_opts: {
    data: PersistObject;
    options?: ExtraOptions & { shouldReturn?: boolean };
  }): Promise<TCount & { data: TNullable<DataObject> }> {
    return this.denyOperation(this.create.name);
  }

  /** @throws Error - disabled in read-only repository. */
  override createAll(opts: {
    data: Array<PersistObject>;
    options: ExtraOptions & { shouldReturn: false };
  }): Promise<TCount & { data: undefined | null }>;
  override createAll(opts: {
    data: Array<PersistObject>;
    options?: ExtraOptions & { shouldReturn?: true };
  }): Promise<TCount & { data: Array<DataObject> }>;
  override createAll(_opts: {
    data: Array<PersistObject>;
    options?: ExtraOptions & { shouldReturn?: boolean };
  }): Promise<TCount & { data: TNullable<Array<DataObject>> }> {
    return this.denyOperation(this.createAll.name);
  }

  /** @throws Error - disabled in read-only repository. */
  override updateById(opts: {
    id: IdType;
    data: Partial<PersistObject>;
    options: ExtraOptions & { shouldReturn: false };
  }): Promise<TCount & { data: undefined | null }>;
  override updateById<R = DataObject>(opts: {
    id: IdType;
    data: Partial<R>;
    options?: ExtraOptions & { shouldReturn?: true };
  }): Promise<TCount & { data: DataObject }>;
  override updateById<R = DataObject>(_opts: {
    id: IdType;
    data: Partial<PersistObject>;
    options?: ExtraOptions & { shouldReturn?: boolean };
  }): Promise<TCount & { data: TNullable<R> }> {
    return this.denyOperation(this.updateById.name);
  }

  /** @throws Error - disabled in read-only repository. */
  override updateAll(opts: {
    data: Partial<PersistObject>;
    where: TWhere<DataObject>;
    options: ExtraOptions & { shouldReturn: false; force?: boolean };
  }): Promise<TCount & { data: undefined | null }>;
  override updateAll<R = DataObject>(opts: {
    data: Partial<PersistObject>;
    where: TWhere<DataObject>;
    options?: ExtraOptions & { shouldReturn?: true; force?: boolean };
  }): Promise<TCount & { data: Array<R> }>;
  override updateAll<R = DataObject>(_opts: {
    data: Partial<PersistObject>;
    where: TWhere<DataObject>;
    options?: ExtraOptions & { shouldReturn?: boolean; force?: boolean };
  }): Promise<TCount & { data: TNullable<Array<R>> }> {
    return this.denyOperation(this.updateAll.name);
  }

  /** @throws Error - disabled in read-only repository. */
  override deleteById(opts: {
    id: IdType;
    options: ExtraOptions & { shouldReturn: false };
  }): Promise<TCount & { data: undefined | null }>;
  override deleteById<R = DataObject>(opts: {
    id: IdType;
    options?: ExtraOptions & { shouldReturn?: true };
  }): Promise<TCount & { data: R }>;
  override deleteById<R = DataObject>(_opts: {
    id: IdType;
    options?: ExtraOptions & { shouldReturn?: boolean };
  }): Promise<TCount & { data: TNullable<R> }> {
    return this.denyOperation(this.deleteById.name);
  }

  /** @throws Error - disabled in read-only repository. */
  override deleteAll(opts: {
    where?: TWhere<DataObject>;
    options: ExtraOptions & { shouldReturn: false; force?: boolean };
  }): Promise<TCount & { data: undefined | null }>;
  override deleteAll<R = DataObject>(opts: {
    where?: TWhere<DataObject>;
    options?: ExtraOptions & { shouldReturn?: true; force?: boolean };
  }): Promise<TCount & { data: Array<R> }>;
  override deleteAll<R = DataObject>(_opts: {
    where?: TWhere<DataObject>;
    options?: ExtraOptions & { shouldReturn?: boolean; force?: boolean };
  }): Promise<TCount & { data: TNullable<Array<R>> }> {
    return this.denyOperation(this.deleteAll.name);
  }
}
