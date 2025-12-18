import { IDataSource } from '@/base/datasources';
import { BaseEntity, IdType, TTableInsert, TTableObject, TTableSchemaWithId } from '@/base/models';
import { getError, TClass, TNullable } from '@venizia/ignis-helpers';
import {
  RepositoryOperationScopes,
  TCount,
  TFilter,
  TRepositoryLogOptions,
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
  ExtraOptions extends TNullable<object> = undefined,
> extends AbstractRepository<EntitySchema, DataObject, PersistObject, ExtraOptions> {
  constructor(ds?: IDataSource, opts?: { entityClass?: TClass<BaseEntity<EntitySchema>> }) {
    super(ds, {
      entityClass: opts?.entityClass,
      operationScope: RepositoryOperationScopes.READ_ONLY,
    });
  }

  // ---------------------------------------------------------------------------
  override count(opts: { where: TWhere<DataObject>; options?: ExtraOptions }): Promise<TCount> {
    return new Promise((resolve, reject) => {
      const where = this.filterBuilder.toWhere({
        tableName: this.entity.name,
        schema: this.entity.schema,
        where: opts.where,
      });

      // this.logger.debug('[count] Count with condition | where: %j', where);

      this.connector
        .$count(this.entity.schema, where)
        .then((count: number) => {
          resolve({ count });
        })
        .catch(reject);
    });
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
  protected getQueryInterface() {
    const queryInterface = this.connector.query[this.entity.name];
    if (!queryInterface) {
      const availableKeys = Object.keys(this.connector.query || {});
      throw getError({
        message: `[${this.constructor.name}] Schema key mismatch | Entity name '${this.entity.name}' not found in connector.query | Available keys: [${availableKeys.join(', ')}] | Ensure the model's TABLE_NAME matches the schema registration key`,
      });
    }
    return queryInterface;
  }

  override find(opts: {
    filter: TFilter<DataObject>;
    options?: ExtraOptions;
  }): Promise<Array<DataObject>> {
    const queryOptions = this.buildQuery({ filter: opts.filter });
    return this.getQueryInterface().findMany(queryOptions);
  }

  override findOne(opts: {
    filter: TFilter<DataObject>;
    options?: ExtraOptions;
  }): Promise<TNullable<DataObject>> {
    const queryOptions = this.buildQuery({ filter: opts.filter });
    return this.getQueryInterface().findFirst(queryOptions);
  }

  override findById(opts: {
    id: IdType;
    filter?: Exclude<TFilter<DataObject>, 'where'>;
    options?: ExtraOptions;
  }): Promise<TNullable<DataObject>> {
    return this.findOne({
      filter: {
        where: { id: opts.id },
        ...opts.filter,
      },
      options: opts.options,
    });
  }

  // ---------------------------------------------------------------------------
  override create(opts: {
    data: PersistObject;
    options: (ExtraOptions | {}) & { shouldReturn: false; log?: TRepositoryLogOptions };
  }): Promise<TCount & { data: null }>;

  override create(opts: {
    data: PersistObject;
    options?: (ExtraOptions | {}) & { shouldReturn?: true; log?: TRepositoryLogOptions };
  }): Promise<TCount & { data: EntitySchema['$inferSelect'] }>;

  override create(_opts: {
    data: PersistObject;
    options?: (ExtraOptions | {}) & { shouldReturn?: boolean; log?: TRepositoryLogOptions };
  }): Promise<TCount & { data: TNullable<EntitySchema['$inferSelect']> }> {
    throw getError({
      message: `[${this.create.name}] Repository operation is NOT ALLOWED | scope: ${this.operationScope}`,
    });
  }

  override createAll(opts: {
    data: Array<PersistObject>;
    options: (ExtraOptions | {}) & { shouldReturn: false; log?: TRepositoryLogOptions };
  }): Promise<TCount & { data: null }>;

  override createAll(opts: {
    data: Array<PersistObject>;
    options?: (ExtraOptions | {}) & { shouldReturn?: true; log?: TRepositoryLogOptions };
  }): Promise<TCount & { data: Array<EntitySchema['$inferSelect']> }>;

  override createAll(_opts: {
    data: Array<PersistObject>;
    options?: (ExtraOptions | {}) & { shouldReturn?: boolean; log?: TRepositoryLogOptions };
  }): Promise<TCount & { data: TNullable<Array<EntitySchema['$inferSelect']>> }> {
    throw getError({
      message: `[${this.createAll.name}] Repository operation is NOT ALLOWED | scope: ${this.operationScope}`,
    });
  }

  // ---------------------------------------------------------------------------
  override updateById(opts: {
    id: IdType;
    data: Partial<PersistObject>;
    options: (ExtraOptions | {}) & { shouldReturn: false; log?: TRepositoryLogOptions };
  }): Promise<TCount & { data: null }>;

  override updateById(opts: {
    id: IdType;
    data: Partial<PersistObject>;
    options?: (ExtraOptions | {}) & { shouldReturn?: true; log?: TRepositoryLogOptions };
  }): Promise<TCount & { data: EntitySchema['$inferSelect'] }>;

  override updateById(_opts: {
    id: IdType;
    data: Partial<PersistObject>;
    options?: (ExtraOptions | {}) & { shouldReturn?: boolean; log?: TRepositoryLogOptions };
  }): Promise<TCount & { data: TNullable<EntitySchema['$inferSelect']> }> {
    throw getError({
      message: `[${this.updateById.name}] Repository operation is NOT ALLOWED | scope: ${this.operationScope}`,
    });
  }

  override updateAll(opts: {
    data: Partial<PersistObject>;
    where: TWhere<DataObject>;
    options: (ExtraOptions | {}) & {
      shouldReturn: false;
      force?: boolean;
      log?: TRepositoryLogOptions;
    };
  }): Promise<TCount & { data: null }>;

  override updateAll(opts: {
    data: Partial<PersistObject>;
    where: TWhere<DataObject>;
    options?: (ExtraOptions | {}) & {
      shouldReturn?: true;
      force?: boolean;
      log?: TRepositoryLogOptions;
    };
  }): Promise<TCount & { data: Array<EntitySchema['$inferSelect']> }>;

  override updateAll(_opts: {
    data: Partial<PersistObject>;
    where: TWhere<DataObject>;
    options?: (ExtraOptions | {}) & {
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
    options: (ExtraOptions | {}) & { shouldReturn: false; log?: TRepositoryLogOptions };
  }): Promise<TCount & { data: null }>;

  override deleteById(opts: {
    id: IdType;
    options?: (ExtraOptions | {}) & { shouldReturn?: true; log?: TRepositoryLogOptions };
  }): Promise<TCount & { data: EntitySchema['$inferSelect'] }>;

  override deleteById(_opts: {
    id: IdType;
    options?: (ExtraOptions | {}) & { shouldReturn?: boolean; log?: TRepositoryLogOptions };
  }): Promise<TCount & { data: TNullable<EntitySchema['$inferSelect']> }> {
    throw getError({
      message: `[${this.deleteById.name}] Repository operation is NOT ALLOWED | scope: ${this.operationScope}`,
    });
  }

  override deleteAll(opts: {
    where?: TWhere<DataObject>;
    options: (ExtraOptions | {}) & {
      shouldReturn: false;
      force?: boolean;
      log?: TRepositoryLogOptions;
    };
  }): Promise<TCount & { data: null }>;
  override deleteAll(opts: {
    where?: TWhere<DataObject>;
    options?: (ExtraOptions | {}) & {
      shouldReturn?: true;
      force?: boolean;
      log?: TRepositoryLogOptions;
    };
  }): Promise<TCount & { data: Array<EntitySchema['$inferSelect']> }>;
  override deleteAll(_opts: {
    where?: TWhere<DataObject>;
    options?: (ExtraOptions | {}) & {
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
