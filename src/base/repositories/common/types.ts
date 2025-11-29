import { IDataSource } from '@/base/datasources';
import { IdType, TBaseIdEntity } from '@/base/models';
import { IClass, TNullable } from '@/common/types';
import { SQL, Table } from 'drizzle-orm';

// ----------------------------------------------------------------------------------------------------------------------------------------
// Repository Interfaces
// ----------------------------------------------------------------------------------------------------------------------------------------
export type TFilter<T = any> = {
  where?: TWhere<T>;
  fields?: TFields<T>;
  include?: TInclusion[];
  order?: string[];
  limit?: number;
  offset?: number;
  skip?: number;
};

export type DrizzleQueryOptions = {
  limit?: number;
  offset?: number;
  orderBy?: SQL[];
  where?: SQL;
  with?: Record<string, boolean | DrizzleQueryOptions>;
  columns?: Record<string, boolean>;
};

export type TWhere<T = any> = { [key in keyof T]: any } & { and?: TWhere<T>[]; or?: TWhere<T>[] };

export type TFields<T = any> = { [K in keyof T]?: boolean };

export type TInclusion = { relation: string; scope?: TFilter };

export type TCount = { count: number };

// --------------------------------------------------------------------------------------
export interface IRepository<Entity extends TBaseIdEntity> {
  dataSource: IDataSource;
  entityClass: IClass<Entity>;
  table: Table;
}

export interface IViewRepository<
  Entity extends TBaseIdEntity,
  ExtraOptions extends object = {},
> extends IRepository<Entity> {
  count(opts: { where: TWhere<Entity>; options?: ExtraOptions }): Promise<TCount>;
  existsWith(opts: { where: TWhere<Entity>; options?: ExtraOptions }): Promise<boolean>;

  find(opts: { filter: TFilter<Entity>; options?: ExtraOptions }): Promise<Array<Entity>>;
  findById(opts: { id: IdType; options?: ExtraOptions }): Promise<TNullable<Entity>>;
  findOne(opts: { filter: TFilter<Entity>; options?: ExtraOptions }): Promise<TNullable<Entity>>;
}

export interface IPersistableRepository<
  Entity extends TBaseIdEntity,
  ExtraOptions extends object = {},
> extends IViewRepository<Entity, ExtraOptions> {
  create(opts: {
    data: Partial<Entity>;
    options?: ExtraOptions & { returning: boolean };
  }): Promise<TNullable<Entity>>;
  createAll(opts: {
    data: Partial<Entity>[];
    options?: ExtraOptions & { returning: boolean };
  }): Promise<TNullable<Array<Entity>>>;

  updateById(opts: {
    id: IdType;
    data: Partial<Entity>;
    options?: ExtraOptions & { returning: boolean };
  }): Promise<TCount & TNullable<Entity>>;
  updateAll(opts: {
    data: Partial<Entity>;
    where?: TWhere<Entity>;
    options?: ExtraOptions & { returning: boolean };
  }): Promise<TCount & TNullable<Array<Entity>>>;

  deleteById(opts: {
    id: IdType;
    options?: ExtraOptions & { returning: boolean };
  }): Promise<TCount & TNullable<Entity>>;
  deleteAll(opts: {
    where?: TWhere<Entity>;
    options?: ExtraOptions & { returning: boolean };
  }): Promise<TCount & TNullable<Entity>>;
}

// --------------------------------------------------------------------------------------
/* export interface ITzRepository<E extends TBaseTzEntity> extends IPersistableRepository<E> {
  mixTimestamp(entity: DataObject<E>, options?: { newInstance: boolean }): DataObject<E>;
  mixUserAudit(
    entity: DataObject<E>,
    options?: { newInstance: boolean; authorId: IdType },
  ): DataObject<E>;
} */
