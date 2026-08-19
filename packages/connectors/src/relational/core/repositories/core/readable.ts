import type { IdType } from '@venizia/ignis-kernel';
import type {
  IExtraOptions,
  TCount,
  TDataWithRange,
  TFilter,
  TFindOneOptions,
  TFindOptions,
  TFindRangeOptions,
  TWhere,
} from '@venizia/ignis-kernel';
import { buildDataRange, DEFAULT_LIMIT, RepositoryOperationScopes } from '@venizia/ignis-kernel';
import type { IRelationalDataSource } from '@/relational/core/datasources/common';
import type {
  BaseRelationalEntity,
  TTableInsert,
  TTableObject,
  TTableSchemaWithId,
} from '@/relational/core/models';
import type { TClass, TNullable } from '@venizia/ignis-helpers/common';
import omit from 'lodash/omit';
import type { IRelationalExtraOptions } from '../common';
import { RelationalBaseRepository } from './base';

/** Read-only repository. Write operations throw errors. */
export class ReadableRelationalRepository<
  EntitySchema extends TTableSchemaWithId = TTableSchemaWithId,
  DataObject extends TTableObject<EntitySchema> = TTableObject<EntitySchema>,
  PersistObject extends TTableInsert<EntitySchema> = TTableInsert<EntitySchema>,
  ExtraOptions extends IExtraOptions = IRelationalExtraOptions,
  TDataSource extends IRelationalDataSource = IRelationalDataSource,
> extends RelationalBaseRepository<
  EntitySchema,
  DataObject,
  PersistObject,
  ExtraOptions,
  TDataSource
> {
  constructor(
    ds?: TDataSource,
    opts?: { entityClass?: TClass<BaseRelationalEntity<EntitySchema>> },
  ) {
    super(ds, {
      entityClass: opts?.entityClass,
      operationScope: RepositoryOperationScopes.READ_ONLY,
    });
  }

  /** Core API is ~15-20% faster but supports neither relations nor field selection. */
  protected canUseCoreAPI(filter: TFilter<DataObject>): boolean {
    const hasInclude = filter.include && filter.include.length > 0;
    const hasFields =
      filter.fields &&
      (Array.isArray(filter.fields)
        ? filter.fields.length > 0
        : Object.keys(filter.fields).length > 0);

    return !hasInclude && !hasFields;
  }

  /** Executes a query through the executor's Core-API `select`. */
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

    return this.queryExecutor.select<R>({
      connector: this.resolveConnector({ transaction: options?.transaction }),
      table: schema,
      columns: this.getVisibleProperties(),
      where,
      orderBy,
      limit,
      offset,
      lock: opts.options?.lock,
    });
  }

  /** Executes a query using the executor's relational Query API (supports relations and field selection). */
  protected async findWithQueryAPI<R = DataObject>(opts: {
    filter: TFilter<DataObject>;
    options?: ExtraOptions;
  }): Promise<Array<R>> {
    const queryOptions = this.buildQuery({ filter: opts.filter });

    return this.queryExecutor.findMany<R>({
      connector: this.resolveConnector({ transaction: opts.options?.transaction }),
      entityName: this.entity.name,
      query: queryOptions,
      scope: this.constructor.name,
    });
  }

  override find<R = DataObject>(opts: {
    filter: TFilter<DataObject>;
    options: TFindRangeOptions<ExtraOptions, R>;
  }): Promise<TDataWithRange<R>>;

  override find<R = DataObject>(opts: {
    filter: TFilter<DataObject>;
    options?: TFindOptions<ExtraOptions, R>;
  }): Promise<Array<R>>;

  /** Auto-selects Core API or Query API based on filter complexity. */
  override async find<R = DataObject>(opts: {
    filter: TFilter<DataObject>;
    options?: TFindOptions<ExtraOptions, R> | TFindRangeOptions<ExtraOptions, R>;
  }): Promise<Array<R> | TDataWithRange<R>> {
    const { filter, options } = opts;

    if (options?.retry) {
      return options.shouldQueryRange === true
        ? this.findRangeUntil<R>({ filter, options })
        : this.findUntil<R>({ filter, options });
    }

    const shouldQueryRange = options?.shouldQueryRange === true;

    const baseFilter = this.applyDefaultFilter({
      userFilter: filter,
      shouldSkipDefaultFilter: options?.shouldSkipDefaultFilter,
    });

    // Checked on the CALLER's value, before the default fills in: `??` only replaces a nullish
    // limit, so a negative or over-ceiling one used to pass straight through to the dialect.
    this.assertFilterLimits({ filter: baseFilter, scope: 'find' });

    const mergedFilter: TFilter<DataObject> = {
      ...baseFilter,
      limit: baseFilter.limit ?? this.getDefaultLimit() ?? DEFAULT_LIMIT,
    };

    // ExtraOptions is caller-bound and otherwise unconstrained, so the spread cannot be proven to still satisfy the generic bound.
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

    // A transaction connector wraps a single client, so running data and count in parallel would reuse it while still busy - parallel is only safe outside a transaction.
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
    options?: TFindOneOptions<ExtraOptions, R>;
  }): Promise<TNullable<R>> {
    if (opts.options?.retry) {
      return this.findOneUntil<R>({ filter: opts.filter, options: opts.options });
    }

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

    return this.queryExecutor.findFirst<R>({
      connector: this.resolveConnector({ transaction: opts?.options?.transaction }),
      entityName: this.entity.name,
      query: queryOptions,
      scope: this.constructor.name,
    });
  }

  /** Delegates to findOne with id in the where clause. */
  override findById<R = DataObject>(opts: {
    id: IdType;
    filter?: Omit<TFilter<DataObject>, 'where'>;
    options?: TFindOneOptions<ExtraOptions, R>;
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

    const count = await this.queryExecutor.count({
      connector: this.resolveConnector({ transaction: opts.options?.transaction }),
      table: this.entity.schema,
      where,
    });

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
    return this.denyOperation({ methodName: this.create.name });
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
    return this.denyOperation({ methodName: this.createAll.name });
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
    return this.denyOperation({ methodName: this.updateById.name });
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
    return this.denyOperation({ methodName: this.updateAll.name });
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
    return this.denyOperation({ methodName: this.deleteById.name });
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
    return this.denyOperation({ methodName: this.deleteAll.name });
  }
}
