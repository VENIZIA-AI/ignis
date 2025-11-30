import { IDataSource } from '@/base/datasources';
import { BaseEntity, IdType, TTableObject, TTableSchemaWithId } from '@/base/models';
import { IClass, TNullable } from '@/common/types';
import { getError } from '@/helpers';
import { RepositoryOperationScopes, TCount, TFilter, TWhere } from '../common';
import { AbstractRepository } from './base';

export class ViewRepository<
  EntitySchema extends TTableSchemaWithId = any,
  ExtraOptions extends object = {},
> extends AbstractRepository<EntitySchema, ExtraOptions> {
  constructor(opts: { entityClass: IClass<BaseEntity<EntitySchema>>; dataSource: IDataSource }) {
    super({
      entityClass: opts.entityClass,
      dataSource: opts.dataSource,
      operationScope: RepositoryOperationScopes.READ_ONLY,
    });
  }

  override count(opts: {
    where: TWhere<TTableObject<EntitySchema>>;
    options?: ExtraOptions;
  }): Promise<TCount> {
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
    where: TWhere<TTableObject<EntitySchema>>;
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

  override find(opts: {
    filter: TFilter<TTableObject<EntitySchema>>;
    options?: ExtraOptions;
  }): Promise<BaseEntity<EntitySchema>[]> {
    const queryOptions = this.filterBuilder.build({
      schema: this.entity.schema,
      filter: opts.filter,
    });

    return this.connector.query[this.modelName].findMany(queryOptions);
  }

  override findOne(opts: {
    filter: TFilter<TTableObject<EntitySchema>>;
    options?: ExtraOptions;
  }): Promise<TNullable<BaseEntity<EntitySchema>>> {
    const queryOptions = this.filterBuilder.build({
      schema: this.entity.schema,
      filter: opts.filter,
    });

    const { limit, offset, ...findFirstOptions } = queryOptions;
    return this.connector.query[this.modelName].findFirst(findFirstOptions);
  }

  override findById(opts: {
    id: IdType;
    filter?: Exclude<TFilter<TTableObject<EntitySchema>>, 'where'>;
    options?: ExtraOptions;
  }): Promise<TNullable<BaseEntity<EntitySchema>>> {
    return this.findOne({
      filter: {
        where: { id: opts.id },
        ...opts.filter,
      },
      options: opts.options,
    });
  }

  override create(_opts: {
    data: Partial<BaseEntity<EntitySchema>>;
    options?: ExtraOptions & { returning: boolean };
  }): Promise<TNullable<BaseEntity<EntitySchema>>> {
    throw getError({
      message: `[create] Repository operation is NOT ALLOWED | scope: READ_ONLY`,
    });
  }

  override createAll(_opts: {
    data: Partial<BaseEntity<EntitySchema>>[];
    options?: ExtraOptions & { returning: boolean };
  }): Promise<TNullable<BaseEntity<EntitySchema>[]>> {
    throw getError({
      message: `[createAll] Repository operation is NOT ALLOWED | scope: READ_ONLY`,
    });
  }

  override updateById(_opts: {
    id: IdType;
    data: Partial<BaseEntity<EntitySchema>>;
    options?: ExtraOptions & { returning: boolean };
  }): Promise<TCount & TNullable<BaseEntity<EntitySchema>>> {
    throw getError({
      message: `[updateById] Repository operation is NOT ALLOWED | scope: READ_ONLY`,
    });
  }

  override updateAll(_opts: {
    data: Partial<BaseEntity<EntitySchema>>;
    where?: TWhere<BaseEntity<EntitySchema>>;
    options?: ExtraOptions & { returning: boolean };
  }): Promise<TCount & TNullable<BaseEntity<EntitySchema>[]>> {
    throw getError({
      message: `[updateAll] Repository operation is NOT ALLOWED | scope: READ_ONLY`,
    });
  }

  override deleteById(_opts: {
    id: IdType;
    options?: ExtraOptions & { returning: boolean };
  }): Promise<TCount & TNullable<BaseEntity<EntitySchema>>> {
    throw getError({
      message: `[deleteById] Repository operation is NOT ALLOWED | scope: READ_ONLY`,
    });
  }

  override deleteAll(_opts: {
    where?: TWhere<BaseEntity<EntitySchema>>;
    options?: ExtraOptions & { returning: boolean };
  }): Promise<TCount & TNullable<BaseEntity<EntitySchema>>> {
    throw getError({
      message: `[deleteAll] Repository operation is NOT ALLOWED | scope: READ_ONLY`,
    });
  }
}
