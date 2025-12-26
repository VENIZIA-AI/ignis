import { IDataSource } from '@/base/datasources';
import { BaseEntity, IdType, TTableInsert, TTableObject, TTableSchemaWithId } from '@/base/models';
import { getError, TClass, TNullable } from '@venizia/ignis-helpers';
import { PgTable } from 'drizzle-orm/pg-core';
import {
  RepositoryOperationScopes,
  TCount,
  TFilter,
  TRepositoryLogOptions,
  TTransactionOption,
  TWhere,
} from '../common';
import { AbstractRepository } from './base';

/**
 * Read-only repository with dependency injection support.
 */
export class ReadableRepository<
  EntitySchema extends TTableSchemaWithId = TTableSchemaWithId,
  DataObject extends TTableObject<EntitySchema> = TTableObject<EntitySchema>,
  PersistObject extends TTableInsert<EntitySchema> = TTableInsert<EntitySchema>,
  ExtraOptions extends TTransactionOption = TTransactionOption,
> extends AbstractRepository<EntitySchema, DataObject, PersistObject, ExtraOptions> {
  constructor(ds?: IDataSource, opts?: { entityClass?: TClass<BaseEntity<EntitySchema>> }) {
    super(ds, {
      entityClass: opts?.entityClass,
      operationScope: RepositoryOperationScopes.READ_ONLY,
    });
  }

  // ---------------------------------------------------------------------------
  override async count(opts: {
    where: TWhere<DataObject>;
    options?: ExtraOptions;
  }): Promise<TCount> {
    const where = this.filterBuilder.toWhere({
      tableName: this.entity.name,
      schema: this.entity.schema,
      where: opts.where,
    });

    const connector = this.resolveConnector(opts.options?.transaction);
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
  /**
   * Get the query interface for this entity from the connector.
   * Validates that the schema is properly registered.
   */
  protected getQueryInterface(opts?: { options?: ExtraOptions }) {
    const connector = this.resolveConnector(opts?.options?.transaction);
    const queryInterface = connector.query[this.entity.name];
    if (!queryInterface) {
      const availableKeys = Object.keys(connector.query || {});
      throw getError({
        message: `[${this.constructor.name}] Schema key mismatch | Entity name '${this.entity.name}' not found in connector.query | Available keys: [${availableKeys.join(', ')}] | Ensure the model's TABLE_NAME matches the schema registration key`,
      });
    }
    return queryInterface;
  }

  /**
   * Check if query can use Core API (faster for flat queries).
   * Core API is used when:
   * - No `include` (relations) - Core API doesn't support relations
   * - No `fields` selection - Core API field selection has different syntax
   */
  protected canUseCoreAPI(filter: TFilter<DataObject>): boolean {
    const hasInclude = filter.include && filter.include.length > 0;
    const hasFields = filter.fields && Object.keys(filter.fields).length > 0;
    return !hasInclude && !hasFields;
  }

  /**
   * Execute flat query using Drizzle Core API.
   * ~15-20% faster than Query API for simple queries without relations.
   */
  protected async findWithCoreAPI<R = DataObject>(opts: {
    filter: TFilter<DataObject>;
    isFindOne?: boolean;
    options?: ExtraOptions;
  }): Promise<Array<R>> {
    const { filter, isFindOne = false, options } = opts;
    const schema = this.entity.schema;

    // Build where clause
    const where = filter.where
      ? this.filterBuilder.toWhere({
          tableName: this.entity.name,
          schema,
          where: filter.where,
        })
      : undefined;

    // Build order by clause
    const orderBy = filter.order
      ? this.filterBuilder.toOrderBy({
          tableName: this.entity.name,
          schema,
          order: filter.order,
        })
      : undefined;

    // Calculate limit and offset
    const limit = isFindOne ? 1 : filter.limit;
    const offset = filter.skip ?? filter.offset;

    // Build query using Core API
    // Type assertion to PgTable is safe: EntitySchema extends TTableSchemaWithId which extends PgTable
    const table = schema as PgTable;
    const connector = this.resolveConnector(options?.transaction);
    let query = connector.select().from(table).$dynamic();

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

  override async find<R = DataObject>(opts: {
    filter: TFilter<DataObject>;
    options?: ExtraOptions;
  }): Promise<Array<R>> {
    // Use Core API for flat queries (no relations, no field selection)
    if (this.canUseCoreAPI(opts.filter)) {
      return this.findWithCoreAPI<R>({ filter: opts.filter, options: opts.options });
    }

    // Fall back to Query API for complex queries with relations/fields
    const queryOptions = this.buildQuery({ filter: opts.filter });
    const queryInterface = this.getQueryInterface({ options: opts.options });
    const results = await queryInterface.findMany(queryOptions);
    return results as Array<R>;
  }

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

    // Fall back to Query API for complex queries with relations/fields
    const { limit: _limit, ...queryOptions } = this.buildQuery({ filter: opts.filter });
    const queryInterface = this.getQueryInterface({ options: opts.options });
    const result = await queryInterface.findFirst(queryOptions);
    return (result ?? null) as TNullable<R>;
  }

  override findById<R = DataObject>(opts: {
    id: IdType;
    filter?: Exclude<TFilter<DataObject>, 'where'>;
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
  override create(opts: {
    data: PersistObject;
    options: ExtraOptions & { shouldReturn: false; log?: TRepositoryLogOptions };
  }): Promise<TCount & { data: null }>;

  override create(opts: {
    data: PersistObject;
    options?: ExtraOptions & { shouldReturn?: true; log?: TRepositoryLogOptions };
  }): Promise<TCount & { data: EntitySchema['$inferSelect'] }>;

  override create(_opts: {
    data: PersistObject;
    options?: ExtraOptions & { shouldReturn?: boolean; log?: TRepositoryLogOptions };
  }): Promise<TCount & { data: TNullable<EntitySchema['$inferSelect']> }> {
    throw getError({
      message: `[${this.create.name}] Repository operation is NOT ALLOWED | scope: ${this.operationScope}`,
    });
  }

  override createAll(opts: {
    data: Array<PersistObject>;
    options: ExtraOptions & { shouldReturn: false; log?: TRepositoryLogOptions };
  }): Promise<TCount & { data: null }>;

  override createAll(opts: {
    data: Array<PersistObject>;
    options?: ExtraOptions & { shouldReturn?: true; log?: TRepositoryLogOptions };
  }): Promise<TCount & { data: Array<EntitySchema['$inferSelect']> }>;

  override createAll(_opts: {
    data: Array<PersistObject>;
    options?: ExtraOptions & { shouldReturn?: boolean; log?: TRepositoryLogOptions };
  }): Promise<TCount & { data: TNullable<Array<EntitySchema['$inferSelect']>> }> {
    throw getError({
      message: `[${this.createAll.name}] Repository operation is NOT ALLOWED | scope: ${this.operationScope}`,
    });
  }

  // ---------------------------------------------------------------------------
  override updateById(opts: {
    id: IdType;
    data: Partial<PersistObject>;
    options: ExtraOptions & { shouldReturn: false; log?: TRepositoryLogOptions };
  }): Promise<TCount & { data: null }>;

  override updateById(opts: {
    id: IdType;
    data: Partial<PersistObject>;
    options?: ExtraOptions & { shouldReturn?: true; log?: TRepositoryLogOptions };
  }): Promise<TCount & { data: EntitySchema['$inferSelect'] }>;

  override updateById(_opts: {
    id: IdType;
    data: Partial<PersistObject>;
    options?: ExtraOptions & { shouldReturn?: boolean; log?: TRepositoryLogOptions };
  }): Promise<TCount & { data: TNullable<EntitySchema['$inferSelect']> }> {
    throw getError({
      message: `[${this.updateById.name}] Repository operation is NOT ALLOWED | scope: ${this.operationScope}`,
    });
  }

  override updateAll(opts: {
    data: Partial<PersistObject>;
    where: TWhere<DataObject>;
    options: ExtraOptions & {
      shouldReturn: false;
      force?: boolean;
      log?: TRepositoryLogOptions;
    };
  }): Promise<TCount & { data: null }>;

  override updateAll(opts: {
    data: Partial<PersistObject>;
    where: TWhere<DataObject>;
    options?: ExtraOptions & {
      shouldReturn?: true;
      force?: boolean;
      log?: TRepositoryLogOptions;
    };
  }): Promise<TCount & { data: Array<EntitySchema['$inferSelect']> }>;

  override updateAll(_opts: {
    data: Partial<PersistObject>;
    where: TWhere<DataObject>;
    options?: ExtraOptions & {
      shouldReturn?: boolean;
      force?: boolean;
      log?: TRepositoryLogOptions;
    };
  }): Promise<TCount & { data: TNullable<Array<EntitySchema['$inferSelect']>> }> {
    throw getError({
      message: `[${this.updateAll.name}] Repository operation is NOT ALLOWED | scope: ${this.operationScope}`,
    });
  }

  // ---------------------------------------------------------------------------
  override deleteById(opts: {
    id: IdType;
    options: ExtraOptions & { shouldReturn: false; log?: TRepositoryLogOptions };
  }): Promise<TCount & { data: null }>;

  override deleteById(opts: {
    id: IdType;
    options?: ExtraOptions & { shouldReturn?: true; log?: TRepositoryLogOptions };
  }): Promise<TCount & { data: EntitySchema['$inferSelect'] }>;

  override deleteById(_opts: {
    id: IdType;
    options?: ExtraOptions & { shouldReturn?: boolean; log?: TRepositoryLogOptions };
  }): Promise<TCount & { data: TNullable<EntitySchema['$inferSelect']> }> {
    throw getError({
      message: `[${this.deleteById.name}] Repository operation is NOT ALLOWED | scope: ${this.operationScope}`,
    });
  }

  override deleteAll(opts: {
    where?: TWhere<DataObject>;
    options: ExtraOptions & {
      shouldReturn: false;
      force?: boolean;
      log?: TRepositoryLogOptions;
    };
  }): Promise<TCount & { data: null }>;
  override deleteAll(opts: {
    where?: TWhere<DataObject>;
    options?: ExtraOptions & {
      shouldReturn?: true;
      force?: boolean;
      log?: TRepositoryLogOptions;
    };
  }): Promise<TCount & { data: Array<EntitySchema['$inferSelect']> }>;
  override deleteAll(_opts: {
    where?: TWhere<DataObject>;
    options?: ExtraOptions & {
      shouldReturn?: boolean;
      force?: boolean;
      log?: TRepositoryLogOptions;
    };
  }): Promise<TCount & { data: TNullable<Array<EntitySchema['$inferSelect']>> }> {
    throw getError({
      message: `[${this.deleteAll.name}] Repository operation is NOT ALLOWED | scope: ${this.operationScope}`,
    });
  }
}
