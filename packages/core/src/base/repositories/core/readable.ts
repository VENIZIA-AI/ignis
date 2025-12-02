import { IDataSource } from '@/base/datasources';
import { BaseEntity, IdType, TTableInsert, TTableObject, TTableSchemaWithId } from '@/base/models';
import { IClass, TNullable } from '@/common/types';
import { getError } from '@/helpers';
import { RepositoryOperationScopes, TCount, TFilter, TWhere } from '../common';
import { AbstractRepository } from './base';

export class ReadableRepository<
  EntitySchema extends TTableSchemaWithId = TTableSchemaWithId,
  DataObject extends TTableObject<EntitySchema> = TTableObject<EntitySchema>,
  PersistObject extends TTableInsert<EntitySchema> = TTableInsert<EntitySchema>,
  ExtraOptions extends TNullable<object> = undefined,
> extends AbstractRepository<EntitySchema, DataObject, PersistObject, ExtraOptions> {
  constructor(opts: { entityClass: IClass<BaseEntity<EntitySchema>>; dataSource: IDataSource }) {
    super({
      entityClass: opts.entityClass,
      dataSource: opts.dataSource,
      operationScope: RepositoryOperationScopes.READ_ONLY,
    });
  }

  // ---------------------------------------------------------------------------
  override count(opts: { where: TWhere<DataObject>; options?: ExtraOptions }): Promise<TCount> {
    return new Promise((resolve, reject) => {
      const where = this.filterBuilder.toWhere({
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
    return new Promise((resolve, reject) => {
      this.count(opts)
        .then(rs => {
          resolve(rs.count > 0);
        })
        .catch(reject);
    });
  }

  // ---------------------------------------------------------------------------
  override find(opts: {
    filter: TFilter<DataObject>;
    options?: ExtraOptions;
  }): Promise<Array<DataObject>> {
    const queryOptions = this.filterBuilder.build({
      schema: this.entity.schema,
      filter: opts.filter,
    });

    return this.connector.query[this.entity.name].findMany(queryOptions);
  }

  override findOne(opts: {
    filter: TFilter<DataObject>;
    options?: ExtraOptions;
  }): Promise<TNullable<DataObject>> {
    const queryOptions = this.filterBuilder.build({
      schema: this.entity.schema,
      filter: opts.filter,
    });

    const { limit, offset, ...findFirstOptions } = queryOptions;
    return this.connector.query[this.entity.name].findFirst(findFirstOptions);
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
  override create(_opts: {
    data: PersistObject;
    options?: (ExtraOptions | {}) & { returning?: boolean };
  }): Promise<TCount & { data: TNullable<EntitySchema['$inferSelect']> }> {
    throw getError({
      message: `[${this.create.name}] Repository operation is NOT ALLOWED | scope: ${this.operationScope}`,
    });
  }

  override createAll(_opts: {
    data: Array<PersistObject>;
    options?: (ExtraOptions | {}) & { returning?: boolean };
  }): Promise<TCount & { data: TNullable<Array<EntitySchema['$inferSelect']>> }> {
    throw getError({
      message: `[${this.createAll.name}] Repository operation is NOT ALLOWED | scope: ${this.operationScope}`,
    });
  }

  // ---------------------------------------------------------------------------
  override updateById(_opts: {
    id: IdType;
    data: Partial<PersistObject>;
    options?: (ExtraOptions | {}) & { returning?: boolean };
  }): Promise<TCount & { data: TNullable<EntitySchema['$inferSelect']> }> {
    throw getError({
      message: `[${this.updateById.name}] Repository operation is NOT ALLOWED | scope: ${this.operationScope}`,
    });
  }

  override updateAll(_opts: {
    data: Partial<PersistObject>;
    where: TWhere<DataObject>;
    options?: (ExtraOptions | {}) & { returning?: boolean; force?: boolean };
  }): Promise<TCount & { data: TNullable<Array<EntitySchema['$inferSelect']>> }> {
    throw getError({
      message: `[${this.updateAll.name}] Repository operation is NOT ALLOWED | scope: ${this.operationScope}`,
    });
  }

  // ---------------------------------------------------------------------------
  override deleteById(_opts: {
    id: IdType;
    options?: (ExtraOptions | {}) & { returning?: boolean };
  }): Promise<TCount & { data: TNullable<EntitySchema['$inferSelect']> }> {
    throw getError({
      message: `[${this.deleteById.name}] Repository operation is NOT ALLOWED | scope: ${this.operationScope}`,
    });
  }

  override deleteAll(_opts: {
    where?: TWhere<DataObject>;
    options?: (ExtraOptions | {}) & { returning?: boolean; force?: boolean };
  }): Promise<TCount & { data: TNullable<Array<EntitySchema['$inferSelect']>> }> {
    throw getError({
      message: `[${this.deleteAll.name}] Repository operation is NOT ALLOWED | scope: ${this.operationScope}`,
    });
  }
}
