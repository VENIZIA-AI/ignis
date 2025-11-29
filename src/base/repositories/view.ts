import { IClass, TNullable } from '@/common/types';
import { getError } from '@/helpers';
import { IDataSource } from '../datasources';
import { IdType, TBaseIdEntity } from '../models';
import { AbstractRepository } from './base';
import { RepositoryOperationScopes, TCount, TFilter, TWhere } from './common';
import { DrizzleFilterBuilder } from './filter-factory';

export class ViewRepository<
  Entity extends TBaseIdEntity,
  ExtraOptions extends object = {},
> extends AbstractRepository<Entity, ExtraOptions> {
  constructor(opts: { entityClass: IClass<Entity>; dataSource: IDataSource }) {
    super({
      entityClass: opts.entityClass,
      dataSource: opts.dataSource,
      operationScope: RepositoryOperationScopes.READ_ONLY,
    });
  }

  override async count(opts: { where: TWhere<Entity>; options?: ExtraOptions }): Promise<TCount> {
    const where = DrizzleFilterBuilder.parseWhere(this.table, opts.where);
    const count = await this.connector.$count(this.table, where);
    return { count };
  }

  override async existsWith(opts: {
    where: TWhere<Entity>;
    options?: ExtraOptions;
  }): Promise<boolean> {
    const rs = await this.count(opts);
    return rs.count > 0;
  }

  override async find(opts: { filter: TFilter; options?: ExtraOptions }): Promise<Entity[]> {
    const queryOptions = DrizzleFilterBuilder.build(this.table, opts.filter);
    return this.connector.query[this.modelName].findMany(queryOptions);
  }

  override findById(opts: { id: IdType; options?: ExtraOptions }): Promise<TNullable<Entity>> {
    return this.findOne({
      filter: { where: { id: opts.id } as TWhere<Entity> },
      options: opts.options,
    });
  }

  override async findOne(opts: {
    filter: TFilter<Entity>;
    options?: ExtraOptions;
  }): Promise<TNullable<Entity>> {
    const queryOptions = DrizzleFilterBuilder.build(this.table, opts.filter);
    const { limit, offset, ...findFirstOptions } = queryOptions;
    return this.connector.query[this.modelName].findFirst(findFirstOptions);
  }

  override create(_opts: {
    data: Partial<Entity>;
    options?: ExtraOptions & { returning: boolean };
  }): Promise<TNullable<Entity>> {
    throw getError({
      message: `[create] Repository operation is NOT ALLOWED | scope: READ_ONLY`,
    });
  }

  override createAll(_opts: {
    data: Partial<Entity>[];
    options?: ExtraOptions & { returning: boolean };
  }): Promise<TNullable<Entity[]>> {
    throw getError({
      message: `[createAll] Repository operation is NOT ALLOWED | scope: READ_ONLY`,
    });
  }

  override updateById(_opts: {
    id: IdType;
    data: Partial<Entity>;
    options?: ExtraOptions & { returning: boolean };
  }): Promise<TCount & TNullable<Entity>> {
    throw getError({
      message: `[updateById] Repository operation is NOT ALLOWED | scope: READ_ONLY`,
    });
  }

  override updateAll(_opts: {
    data: Partial<Entity>;
    where?: TWhere<Entity>;
    options?: ExtraOptions & { returning: boolean };
  }): Promise<TCount & TNullable<Entity[]>> {
    throw getError({
      message: `[updateAll] Repository operation is NOT ALLOWED | scope: READ_ONLY`,
    });
  }

  override deleteById(_opts: {
    id: IdType;
    options?: ExtraOptions & { returning: boolean };
  }): Promise<TCount & TNullable<Entity>> {
    throw getError({
      message: `[deleteById] Repository operation is NOT ALLOWED | scope: READ_ONLY`,
    });
  }

  override deleteAll(_opts: {
    where?: TWhere<Entity>;
    options?: ExtraOptions & { returning: boolean };
  }): Promise<TCount & TNullable<Entity>> {
    throw getError({
      message: `[deleteAll] Repository operation is NOT ALLOWED | scope: READ_ONLY`,
    });
  }
}
