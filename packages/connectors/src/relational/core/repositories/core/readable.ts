import { HTTP, ObjectUtility } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';
import type {
  IExtraOptions,
  TByIdFilter,
  TCount,
  TDataWithRange,
  TFields,
  TFilter,
  TFindOneOptions,
  TFindOptions,
  TFindRangeOptions,
  TRow,
  TWhere,
} from '@venizia/ignis-kernel';
import {
  DataRangeUtility,
  DEFAULT_LIMIT,
  DEFAULT_MAX_LIMIT,
  RepositoryOperationScopes,
} from '@venizia/ignis-kernel';
import type { IRelationalDataSource } from '@/relational/core/datasources/common';
import type {
  BaseRelationalEntity,
  TTableInsert,
  TTableObject,
  TTableSchemaWithId,
} from '@/relational/core/models';
import type { TClass, TNullable } from '@venizia/ignis-helpers/common';
import type { IRelationalExtraOptions, TFindEveryFilter } from '../common';
import { RelationalBaseRepository } from './base';

/** Rows a `findEvery` page holds when the caller names no size. */
const FIND_EVERY_DEFAULT_PAGE_SIZE = 500;

/** Largest `pageSize` a `findEvery` accepts, whatever the model's own `limit.max` allows. */
const FIND_EVERY_MAX_PAGE_SIZE = 10_000;

/** The filter keys the key cursor owns: the order and the window of every page. */
const FIND_EVERY_REFUSED_KEYS = ['order', 'limit', 'skip', 'offset', 'include'] as const;

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
    /** True only for the recursive call from `find()`, whose `filter` is already scope+default merged - prevents the row scope from being AND-composed twice. Never set from `findOne()`, whose `filter` here is still raw. */
    dangerouslySkipScopeFilter?: boolean;
  }): Promise<Array<R>> {
    const { filter, isFindOne = false, options, dangerouslySkipScopeFilter } = opts;
    const schema = this.entity.schema;

    const mergedFilter = this.applyDefaultFilter({
      userFilter: filter,
      shouldSkipDefaultFilter: options?.shouldSkipDefaultFilter,
      dangerouslySkipScopeFilter,
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

    const connector = await this.acquireConnector({ transaction: options?.transaction });

    return this.queryExecutor.select<R>({
      connector,
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

    const connector = await this.acquireConnector({ transaction: opts.options?.transaction });

    return this.queryExecutor.findMany<R>({
      connector,
      entityName: this.entity.name,
      query: queryOptions,
      scope: this.constructor.name,
    });
  }

  /**
   * Returns the rows matching `filter`; `options.shouldQueryRange` returns them with their range.
   * @example
   * ```typescript
   * import { ReadableRepository } from '@venizia/ignis-connectors/postgres';
   * import { integer, pgTable, text } from 'drizzle-orm/pg-core';
   *
   * const users = pgTable('User', { id: integer('id').primaryKey(), status: text('status') });
   * declare const repo: ReadableRepository<typeof users>;
   * const rows = await repo.find({ filter: { where: { status: 'ACTIVE' }, order: ['id DESC'], limit: 10 } });
   * const page = await repo.find({ filter: { limit: 10 }, options: { shouldQueryRange: true } });
   * ```
   */
  override find<R = unknown, const F extends TFields<DataObject> = TFields<DataObject>>(opts: {
    filter: TFilter<DataObject, F>;
    options: TFindRangeOptions<ExtraOptions, TRow<DataObject, R, F>>;
  }): Promise<TDataWithRange<TRow<DataObject, R, F>>>;

  override find<R = unknown, const F extends TFields<DataObject> = TFields<DataObject>>(opts: {
    filter: TFilter<DataObject, F>;
    options?: TFindOptions<ExtraOptions, TRow<DataObject, R, F>>;
  }): Promise<Array<TRow<DataObject, R, F>>>;

  /** Auto-selects Core API or Query API based on filter complexity. */
  override async find<
    R = unknown,
    const F extends TFields<DataObject> = TFields<DataObject>,
  >(opts: {
    filter: TFilter<DataObject, F>;
    options?:
      | TFindOptions<ExtraOptions, TRow<DataObject, R, F>>
      | TFindRangeOptions<ExtraOptions, TRow<DataObject, R, F>>;
  }): Promise<Array<TRow<DataObject, R, F>> | TDataWithRange<TRow<DataObject, R, F>>> {
    const { filter, options } = opts;

    if (options?.retry) {
      return options.shouldQueryRange === true
        ? this.findRangeUntil<TRow<DataObject, R, F>>({ filter, options })
        : this.findUntil<TRow<DataObject, R, F>>({ filter, options });
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
      ? this.findWithCoreAPI<TRow<DataObject, R, F>>({
          filter: mergedFilter,
          options: effectiveOptions,
          dangerouslySkipScopeFilter: true,
        })
      : this.findWithQueryAPI<TRow<DataObject, R, F>>({
          filter: mergedFilter,
          options: effectiveOptions,
        });

    if (!shouldQueryRange) {
      return dataPromise;
    }

    // A transaction connector wraps a single client, so running data and count in parallel would reuse it while still busy - parallel is only safe outside a transaction.
    // `mergedFilter.where` already carries the row scope; `count()` re-applies it (a harmless
    // AND-composed repeat, since `count()` stays a public override point read-retry/range test
    // doubles rely on stubbing entirely).
    const countPromise = () =>
      this.count({ where: mergedFilter.where ?? {}, options: effectiveOptions });

    let data: Array<TRow<DataObject, R, F>>;
    let total: number;

    if (effectiveOptions.transaction) {
      const result = await dataPromise;
      data = result;
      const counted = await countPromise();
      total = counted.count;
    } else {
      const [rows, counted] = await Promise.all([dataPromise, countPromise()]);
      data = rows;
      total = counted.count;
    }

    return {
      data,
      range: DataRangeUtility.buildDataRange({
        skip: mergedFilter.skip,
        offset: mergedFilter.offset,
        dataLength: data.length,
        total,
      }),
    };
  }

  /**
   * Visits every row matching `filter`, one row at a time, reading `pageSize` rows per query. A page starts after the
   * last key of the one before (`id > last`, ordered by `id`), so a row inserted or deleted while the loop runs never
   * shifts the window and no offset grows. Rows come in ascending `id` order.
   *
   * Every page goes through `find`, so the default filter, the row scope and the hidden fields apply to each one. The
   * keyset owns the order and the window: a filter with `order`, `limit`, `skip`, `offset` or `include` is refused (400).
   * `pageSize` is a positive integer, 500 by default, at most 10 000 and at most the model's `limit.max`. The key is read
   * for the cursor even when `fields` leaves it out, and is dropped from the rows then. The model's `id` must be a
   * single-column primary key and must not be hidden. Leaving the loop (`break`, `return`, a throw) makes no further query.
   * Every refusal surfaces on the first iteration.
   * @example
   * ```typescript
   * import { ReadableRepository } from '@venizia/ignis-connectors/postgres';
   * import { integer, pgTable, text } from 'drizzle-orm/pg-core';
   *
   * const users = pgTable('User', { id: integer('id').primaryKey(), status: text('status') });
   * declare const repo: ReadableRepository<typeof users>;
   * for await (const user of repo.findEvery({ filter: { where: { status: 'ACTIVE' } }, pageSize: 200 })) {
   *   console.log(user.id);
   * }
   * ```
   */
  async *findEvery<R = unknown, const F extends TFields<DataObject> = TFields<DataObject>>(opts: {
    filter?: TFindEveryFilter<DataObject, F>;
    pageSize?: number;
    options?: ExtraOptions;
  }): AsyncGenerator<TRow<DataObject, R, F>, void, undefined> {
    const { filter, options } = opts;
    const scope = 'findEvery';

    this.assertFindEveryKey({ scope });
    this.assertFindEveryFilter({ filter, scope });

    const pageSize = this.resolveFindEveryPageSize({ pageSize: opts.pageSize, scope });
    const { fields, isKeyAdded } = this.withKeyField({ fields: filter?.fields });
    // `find` reads the range envelope and the retry from these two; a page is neither.
    const pageOptions = {
      ...options,
      shouldQueryRange: false,
      retry: undefined,
    } as unknown as ExtraOptions;

    let cursor: unknown;
    let isFirstPage = true;

    while (true) {
      const keyset = isFirstPage ? undefined : { id: { gt: cursor } };
      const where = this.joinKeyset({ where: filter?.where, keyset });

      const page = await this.find<Record<string, unknown>>({
        filter: { where, fields, order: ['id ASC'], limit: pageSize } as TFilter<DataObject>,
        options: pageOptions,
      });

      for (const row of page) {
        yield (isKeyAdded ? ObjectUtility.omit({ source: row, keys: ['id'] }) : row) as TRow<
          DataObject,
          R,
          F
        >;
      }

      if (page.length < pageSize) {
        return;
      }

      cursor = page[page.length - 1]?.id;
      isFirstPage = false;
    }
  }

  /** The cursor reads `id`: it must name one row, and the rows `find` returns must carry it. */
  private assertFindEveryKey(opts: { scope: string }): void {
    const column = this.entity.schema.id;

    if (!column.primary && !column.isUnique) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_4.BadRequest,
        message: `[${this.constructor.name}][${opts.scope}] Needs a single-column primary key | 'id' alone does not identify a row of '${this.entity.name}' (composite primary key)`,
      });
    }

    if (this.getHiddenProperties().has('id')) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_4.BadRequest,
        message: `[${this.constructor.name}][${opts.scope}] The key 'id' of '${this.entity.name}' is a hidden property | A page cannot continue from a key it never reads`,
      });
    }
  }

  private assertFindEveryFilter(opts: { filter?: object; scope: string }): void {
    const refused = FIND_EVERY_REFUSED_KEYS.filter(
      (key) =>
        opts.filter !== undefined && (opts.filter as Record<string, unknown>)[key] !== undefined,
    );

    if (refused.length === 0) {
      return;
    }

    throw getError({
      statusCode: HTTP.ResultCodes.RS_4.BadRequest,
      message: `[${this.constructor.name}][${opts.scope}] Refused filter key(s): ${refused.join(', ')} | The key cursor owns the order and the window of every page`,
    });
  }

  private resolveFindEveryPageSize(opts: { pageSize?: number; scope: string }): number {
    const { pageSize, scope } = opts;
    const ceiling = Math.min(FIND_EVERY_MAX_PAGE_SIZE, this.maxLimit ?? DEFAULT_MAX_LIMIT);

    if (pageSize === undefined) {
      return Math.min(FIND_EVERY_DEFAULT_PAGE_SIZE, ceiling);
    }

    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > ceiling) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_4.BadRequest,
        message: `[${this.constructor.name}][${scope}] Invalid 'pageSize' | Expected an integer from 1 to ${ceiling} | Got: ${pageSize}`,
      });
    }

    return pageSize;
  }

  /** The `fields` a page reads: the caller's, plus `id` when they narrow the row without it. `isKeyAdded` says the rows must lose it again. */
  private withKeyField(opts: { fields?: TFields<DataObject> }): {
    fields: TFields<DataObject> | undefined;
    isKeyAdded: boolean;
  } {
    const { fields } = opts;

    if (Array.isArray(fields)) {
      if (fields.length === 0 || fields.includes('id')) {
        return { fields, isKeyAdded: false };
      }

      return { fields: [...fields, 'id'], isKeyAdded: true };
    }

    if (fields && typeof fields === 'object') {
      const record = fields as Record<string, unknown>;

      if (!Object.values(record).includes(true) || record.id === true) {
        return { fields, isKeyAdded: false };
      }

      return { fields: { ...record, id: true } as TFields<DataObject>, isKeyAdded: true };
    }

    return { fields: undefined, isKeyAdded: false };
  }

  /** The caller's `where` and the keyset, both required: an `or` in the caller's `where` must not widen the window. */
  private joinKeyset(opts: {
    where?: TWhere<DataObject>;
    keyset?: Record<string, unknown>;
  }): TWhere<DataObject> | undefined {
    const { where, keyset } = opts;
    const hasWhere = where !== undefined && Object.keys(where).length > 0;

    if (!keyset) {
      return hasWhere ? where : undefined;
    }

    return (hasWhere ? { and: [where, keyset] } : keyset) as TWhere<DataObject>;
  }

  /**
   * Auto-selects Core API or Query API based on filter complexity.
   * @example
   * ```typescript
   * import { ReadableRepository } from '@venizia/ignis-connectors/postgres';
   * import { integer, pgTable, text } from 'drizzle-orm/pg-core';
   *
   * const users = pgTable('User', { id: integer('id').primaryKey(), status: text('status') });
   * declare const repo: ReadableRepository<typeof users>;
   * const user = await repo.findOne({ filter: { where: { status: 'ACTIVE' } } });
   * ```
   */
  override async findOne<
    R = unknown,
    const F extends TFields<DataObject> = TFields<DataObject>,
  >(opts: {
    filter: TFilter<DataObject, F>;
    options?: TFindOneOptions<ExtraOptions, TRow<DataObject, R, F>>;
  }): Promise<TNullable<TRow<DataObject, R, F>>> {
    if (opts.options?.retry) {
      return this.findOneUntil<TRow<DataObject, R, F>>({
        filter: opts.filter,
        options: opts.options,
      });
    }

    const filter = opts.filter;
    const useCoreAPI = this.canUseCoreAPI(filter);

    this.validateLockOptions({
      lock: opts?.options?.lock,
      transaction: opts?.options?.transaction,
      usesQueryAPI: !useCoreAPI,
    });

    if (useCoreAPI) {
      const results = await this.findWithCoreAPI<TRow<DataObject, R, F>>({
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

    const queryOptions = ObjectUtility.omit({
      source: this.buildQuery({ filter: mergedFilter }),
      keys: ['limit'],
    });

    const connector = await this.acquireConnector({ transaction: opts?.options?.transaction });

    return this.queryExecutor.findFirst<TRow<DataObject, R, F>>({
      connector,
      entityName: this.entity.name,
      query: queryOptions,
      scope: this.constructor.name,
    });
  }

  /**
   * Delegates to findOne with id in the where clause.
   * @example
   * ```typescript
   * import { ReadableRepository } from '@venizia/ignis-connectors/postgres';
   * import { integer, pgTable, text } from 'drizzle-orm/pg-core';
   *
   * const users = pgTable('User', { id: integer('id').primaryKey(), status: text('status') });
   * declare const repo: ReadableRepository<typeof users>;
   * const user = await repo.findById({ id: 1 });
   * ```
   */
  override findById<R = unknown, const F extends TFields<DataObject> = TFields<DataObject>>(opts: {
    id: DataObject['id'];
    filter?: TByIdFilter<DataObject, F>;
    options?: TFindOneOptions<ExtraOptions, TRow<DataObject, R, F>>;
  }): Promise<TNullable<TRow<DataObject, R, F>>> {
    return this.findOne<R, F>({
      filter: {
        ...opts.filter,
        where: this.whereById({ id: opts.id }),
      },
      options: opts.options,
    });
  }

  /**
   * Counts the rows matching `where`.
   * @example
   * ```typescript
   * import { ReadableRepository } from '@venizia/ignis-connectors/postgres';
   * import { integer, pgTable, text } from 'drizzle-orm/pg-core';
   *
   * const users = pgTable('User', { id: integer('id').primaryKey(), status: text('status') });
   * declare const repo: ReadableRepository<typeof users>;
   * const { count } = await repo.count({ where: { status: 'ACTIVE' } });
   * ```
   */
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

    const connector = await this.acquireConnector({ transaction: opts.options?.transaction });

    const count = await this.queryExecutor.count({
      connector,
      table: this.entity.schema,
      where,
    });

    return { count };
  }

  /**
   * Tells whether at least one row matches `where`.
   * @example
   * ```typescript
   * import { ReadableRepository } from '@venizia/ignis-connectors/postgres';
   * import { integer, pgTable, text } from 'drizzle-orm/pg-core';
   *
   * const users = pgTable('User', { id: integer('id').primaryKey(), status: text('status') });
   * declare const repo: ReadableRepository<typeof users>;
   * const found = await repo.existsWith({ where: { status: 'ACTIVE' } });
   * ```
   */
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
    id: DataObject['id'];
    data: Partial<PersistObject>;
    options: ExtraOptions & { shouldReturn: false };
  }): Promise<TCount & { data: undefined | null }>;
  override updateById<R = DataObject>(opts: {
    id: DataObject['id'];
    data: Partial<R>;
    options?: ExtraOptions & { shouldReturn?: true };
  }): Promise<TCount & { data: DataObject }>;
  override updateById<R = DataObject>(_opts: {
    id: DataObject['id'];
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
    id: DataObject['id'];
    options: ExtraOptions & { shouldReturn: false };
  }): Promise<TCount & { data: undefined | null }>;
  override deleteById<R = DataObject>(opts: {
    id: DataObject['id'];
    options?: ExtraOptions & { shouldReturn?: true };
  }): Promise<TCount & { data: R }>;
  override deleteById<R = DataObject>(_opts: {
    id: DataObject['id'];
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
