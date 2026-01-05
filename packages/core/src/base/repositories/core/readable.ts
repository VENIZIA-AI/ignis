import { IDataSource } from '@/base/datasources';
import { BaseEntity, IdType, TTableInsert, TTableObject, TTableSchemaWithId } from '@/base/models';
import { getError, TClass, TNullable } from '@venizia/ignis-helpers';
import { PgTable } from 'drizzle-orm/pg-core';
import { IExtraOptions, RepositoryOperationScopes, TCount, TFilter, TWhere } from '../common';
import { AbstractRepository } from './abstract';

// -----------------------------------------------------------------------------
// Readable Repository
// -----------------------------------------------------------------------------

/**
 * Read-only repository implementation.
 *
 * Provides read operations (find, findOne, findById, count, existsWith) while
 * blocking write operations (create, update, delete) with an error.
 *
 * Use this class when you need a repository that should only read data,
 * such as for reporting or analytics views.
 *
 * @template EntitySchema - The Drizzle table schema type with an 'id' column
 * @template DataObject - The type of objects returned from queries
 * @template PersistObject - The type for insert/update operations
 * @template ExtraOptions - Additional options type extending IExtraOptions
 *
 * @example
 * ```typescript
 * @repository({ model: Report, dataSource: PostgresDataSource })
 * export class ReportRepository extends ReadableRepository<typeof Report.schema> {
 *   async getMonthlyStats() {
 *     return this.find({ filter: { where: { type: 'monthly' } } });
 *   }
 * }
 * ```
 */
export class ReadableRepository<
  EntitySchema extends TTableSchemaWithId = TTableSchemaWithId,
  DataObject extends TTableObject<EntitySchema> = TTableObject<EntitySchema>,
  PersistObject extends TTableInsert<EntitySchema> = TTableInsert<EntitySchema>,
  ExtraOptions extends IExtraOptions = IExtraOptions,
> extends AbstractRepository<EntitySchema, DataObject, PersistObject, ExtraOptions> {
  // ---------------------------------------------------------------------------
  // Constructor
  // ---------------------------------------------------------------------------

  /**
   * Creates a new read-only repository instance.
   *
   * @param ds - Optional data source (auto-injected from @repository decorator)
   * @param opts - Optional configuration
   * @param opts.entityClass - Entity class if not using @repository decorator
   */
  constructor(ds?: IDataSource, opts?: { entityClass?: TClass<BaseEntity<EntitySchema>> }) {
    super(ds, {
      entityClass: opts?.entityClass,
      operationScope: RepositoryOperationScopes.READ_ONLY,
    });
  }

  // ---------------------------------------------------------------------------
  // Read Operations
  // ---------------------------------------------------------------------------

  /**
   * Counts records matching the where condition.
   * Applies default filter if configured.
   *
   * @param opts - Options containing where condition
   * @returns Promise resolving to count result
   */
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

  // ---------------------------------------------------------------------------
  // Protected Query Helpers
  // ---------------------------------------------------------------------------

  /**
   * Determines if a query can use the Drizzle Core API for better performance.
   *
   * Core API is ~15-20% faster but has limitations:
   * - No relation inclusion support
   * - Different field selection syntax
   *
   * @param filter - The filter to evaluate
   * @returns True if Core API can be used, false if Query API is needed
   */
  protected canUseCoreAPI(filter: TFilter<DataObject>): boolean {
    const hasInclude = filter.include && filter.include.length > 0;
    const hasFields =
      filter.fields &&
      (Array.isArray(filter.fields)
        ? filter.fields.length > 0
        : Object.keys(filter.fields).length > 0);
    return !hasInclude && !hasFields;
  }

  /**
   * Executes a query using the Drizzle Core API (faster for flat queries).
   *
   * Performance: ~15-20% faster than Query API for simple queries without relations.
   *
   * @template R - Return type (defaults to DataObject)
   * @param opts - Query options
   * @param opts.filter - Filter configuration
   * @param opts.isFindOne - If true, limits to 1 result
   * @param opts.options - Extra options (transaction, logging)
   * @returns Promise resolving to array of results
   */
  protected async findWithCoreAPI<R = DataObject>(opts: {
    filter: TFilter<DataObject>;
    isFindOne?: boolean;
    options?: ExtraOptions;
  }): Promise<Array<R>> {
    const { filter, isFindOne = false, options } = opts;
    const schema = this.entity.schema;

    // Apply default filter
    const mergedFilter = this.applyDefaultFilter({
      userFilter: filter,
      shouldSkipDefaultFilter: options?.shouldSkipDefaultFilter,
    });

    // Build where clause
    const where = mergedFilter.where
      ? this.filterBuilder.toWhere({
          tableName: this.entity.name,
          schema,
          where: mergedFilter.where,
        })
      : undefined;

    // Build order by clause
    const orderBy = mergedFilter.order
      ? this.filterBuilder.toOrderBy({
          tableName: this.entity.name,
          schema,
          order: mergedFilter.order,
        })
      : undefined;

    // Calculate limit and offset
    const limit = isFindOne ? 1 : mergedFilter.limit;
    const offset = mergedFilter.skip ?? mergedFilter.offset;

    // Build query using Core API
    // Type assertion to PgTable is safe: EntitySchema extends TTableSchemaWithId which extends PgTable
    const table = schema as PgTable;
    const connector = this.resolveConnector({ transaction: options?.transaction });

    // Select only visible properties (excludes hidden properties at SQL level)
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

  // ---------------------------------------------------------------------------
  // Find Operations
  // ---------------------------------------------------------------------------

  /**
   * Finds all records matching the filter.
   * Automatically selects Core API or Query API based on filter complexity.
   *
   * @template R - Return type (defaults to DataObject)
   * @param opts - Options containing filter and extra options
   * @returns Promise resolving to array of matching records
   */
  override async find<R = DataObject>(opts: {
    filter: TFilter<DataObject>;
    options?: ExtraOptions;
  }): Promise<Array<R>> {
    // Use Core API for flat queries (no relations, no field selection)
    if (this.canUseCoreAPI(opts.filter)) {
      const rs = await this.findWithCoreAPI<R>({ filter: opts.filter, options: opts.options });
      return rs;
    }

    // Apply default filter for Query API path
    const mergedFilter = this.applyDefaultFilter({
      userFilter: opts.filter,
      shouldSkipDefaultFilter: opts.options?.shouldSkipDefaultFilter,
    });

    // Fall back to Query API for complex queries with relations/fields
    const queryOptions = this.buildQuery({ filter: mergedFilter });
    const queryInterface = this.getQueryInterface({ options: opts.options });
    const rs = await queryInterface.findMany(queryOptions);
    return rs as Array<R>;
  }

  /**
   * Finds the first record matching the filter.
   * Automatically selects Core API or Query API based on filter complexity.
   *
   * @template R - Return type (defaults to DataObject)
   * @param opts - Options containing filter and extra options
   * @returns Promise resolving to the found record or null
   */
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

  /**
   * Finds a record by its ID.
   * Delegates to findOne with id in the where clause.
   *
   * @template R - Return type (defaults to DataObject)
   * @param opts - Options containing id and optional filter (without where)
   * @returns Promise resolving to the found record or null
   */
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

  // ---------------------------------------------------------------------------
  // Disabled Write Operations (Read-Only Repository)
  // ---------------------------------------------------------------------------

  /**
   * Create is disabled in read-only repository.
   * @throws Error indicating operation is not allowed
   */
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
