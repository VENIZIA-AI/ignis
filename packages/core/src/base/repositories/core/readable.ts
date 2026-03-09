import { IDataSource } from '@/base/datasources';
import { BaseEntity, IdType, TTableInsert, TTableObject, TTableSchemaWithId } from '@/base/models';
import { getError, TClass, TNullable } from '@venizia/ignis-helpers';
import { PgTable } from 'drizzle-orm/pg-core';
import {
  IExtraOptions,
  RepositoryOperationScopes,
  TCount,
  TDataRange,
  TFilter,
  TWhere,
} from '../common';
import { AbstractRepository } from './abstract';

/** Read-only repository. Write operations throw errors. */
export class ReadableRepository<
  EntitySchema extends TTableSchemaWithId = TTableSchemaWithId,
  DataObject extends TTableObject<EntitySchema> = TTableObject<EntitySchema>,
  PersistObject extends TTableInsert<EntitySchema> = TTableInsert<EntitySchema>,
  ExtraOptions extends IExtraOptions = IExtraOptions,
> extends AbstractRepository<EntitySchema, DataObject, PersistObject, ExtraOptions> {
  constructor(ds?: IDataSource, opts?: { entityClass?: TClass<BaseEntity<EntitySchema>> }) {
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
      ? this.filterBuilder.toWhere({
          tableName: this.entity.name,
          schema,
          where: mergedFilter.where,
        })
      : undefined;

    const orderBy = mergedFilter.order
      ? this.filterBuilder.toOrderBy({
          tableName: this.entity.name,
          schema,
          order: mergedFilter.order,
        })
      : undefined;

    const limit = isFindOne ? 1 : mergedFilter.limit;
    const offset = mergedFilter.skip ?? mergedFilter.offset;

    // Safe cast: EntitySchema extends TTableSchemaWithId which extends PgTable
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

    return query as Promise<Array<R>>;
  }

  /** Executes a query using Drizzle Query API (supports relations and field selection). */
  protected async findWithQueryAPI<R = DataObject>(opts: {
    filter: TFilter<DataObject>;
    options?: ExtraOptions;
  }): Promise<Array<R>> {
    const queryOptions = this.buildQuery({ filter: opts.filter });
    const queryInterface = this.getQueryInterface({ options: opts.options });
    return queryInterface.findMany(queryOptions) as unknown as Promise<Array<R>>;
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

    const mergedFilter = this.applyDefaultFilter({
      userFilter: filter,
      shouldSkipDefaultFilter: options?.shouldSkipDefaultFilter,
    });

    const effectiveOptions = { ...options, shouldSkipDefaultFilter: true } as ExtraOptions;

    const dataPromise = this.canUseCoreAPI(mergedFilter)
      ? this.findWithCoreAPI<R>({ filter: mergedFilter, options: effectiveOptions })
      : this.findWithQueryAPI<R>({ filter: mergedFilter, options: effectiveOptions });

    if (!shouldQueryRange) {
      return dataPromise;
    }

    const [data, { count: total }] = await Promise.all([
      dataPromise,
      this.count({ where: mergedFilter.where ?? {}, options: effectiveOptions }),
    ]);

    // Build range following HTTP Content-Range standard (inclusive end index)
    const start = mergedFilter.skip ?? mergedFilter.offset ?? 0;
    const end = data.length > 0 ? start + data.length - 1 : start;

    return {
      data,
      range: { start, end, total },
    };
  }

  /** Auto-selects Core API or Query API based on filter complexity. */
  override async findOne<R = DataObject>(opts: {
    filter: TFilter<DataObject>;
    options?: ExtraOptions;
  }): Promise<TNullable<R>> {
    // Use Core API for flat queries (no relations, no field selection)
    if (this.canUseCoreAPI(opts.filter)) {
      const results = await this.findWithCoreAPI<R>({
        filter: opts.filter,
        isFindOne: true,
        options: opts.options,
      });
      return results[0] ?? null;
    }

    // Apply default filter for Query API path
    const mergedFilter = this.applyDefaultFilter({
      userFilter: opts.filter,
      shouldSkipDefaultFilter: opts.options?.shouldSkipDefaultFilter,
    });

    // Fall back to Query API for complex queries with relations/fields
    const { limit: _limit, ...queryOptions } = this.buildQuery({ filter: mergedFilter });
    const queryInterface = this.getQueryInterface({ options: opts.options });
    const result = await queryInterface.findFirst(queryOptions);
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
    // Apply default filter's where condition
    const mergedFilter = this.applyDefaultFilter({
      userFilter: { where: opts.where },
      shouldSkipDefaultFilter: opts.options?.shouldSkipDefaultFilter,
    });

    const where = this.filterBuilder.toWhere({
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
    throw getError({
      message: `[${this.create.name}] Repository operation is NOT ALLOWED | scope: ${this.operationScope}`,
    });
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
    throw getError({
      message: `[${this.createAll.name}] Repository operation is NOT ALLOWED | scope: ${this.operationScope}`,
    });
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
    throw getError({
      message: `[${this.updateById.name}] Repository operation is NOT ALLOWED | scope: ${this.operationScope}`,
    });
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
    throw getError({
      message: `[${this.updateAll.name}] Repository operation is NOT ALLOWED | scope: ${this.operationScope}`,
    });
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
    throw getError({
      message: `[${this.deleteById.name}] Repository operation is NOT ALLOWED | scope: ${this.operationScope}`,
    });
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
    throw getError({
      message: `[${this.deleteAll.name}] Repository operation is NOT ALLOWED | scope: ${this.operationScope}`,
    });
  }
}
