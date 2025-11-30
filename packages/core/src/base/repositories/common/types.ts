import { IDataSource } from '@/base/datasources';
import { BaseEntity, IdType, TTableObject, TTableSchemaWithId } from '@/base/models';
import { TNullable } from '@/common/types';
import { Column, SQL } from 'drizzle-orm';

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

export type TWhere<T = any> = { [key in keyof T]?: any } & {
  and?: TWhere<T>[];
  or?: TWhere<T>[];
};

export type TFields<T = any> = { [K in keyof T]?: boolean };

export type TInclusion = { relation: string; scope?: TFilter };

export type TCount = { count: number };

// --------------------------------------------------------------------------------------
export interface IRepository<EntitySchema extends TTableSchemaWithId = any> {
  dataSource: IDataSource;
  entity: BaseEntity<EntitySchema>;
}

export interface IViewRepository<
  EntitySchema extends TTableSchemaWithId = any,
  ExtraOptions extends object = {},
> extends IRepository<EntitySchema> {
  count(opts: {
    where: TWhere<TTableObject<EntitySchema>>;
    options?: ExtraOptions;
  }): Promise<TCount>;
  existsWith(opts: {
    where: TWhere<TTableObject<EntitySchema>>;
    options?: ExtraOptions;
  }): Promise<boolean>;

  find(opts: {
    filter: TFilter<TTableObject<EntitySchema>>;
    options?: ExtraOptions;
  }): Promise<Array<BaseEntity<EntitySchema>>>;

  findOne(opts: {
    filter: TFilter<TTableObject<EntitySchema>>;
    options?: ExtraOptions;
  }): Promise<TNullable<BaseEntity<EntitySchema>>>;

  findById(opts: {
    id: IdType;
    options?: ExtraOptions;
  }): Promise<TNullable<BaseEntity<EntitySchema>>>;
}

export interface IPersistableRepository<
  EntitySchema extends TTableSchemaWithId = any,
  ExtraOptions extends object = {},
> extends IViewRepository<EntitySchema, ExtraOptions> {
  create(opts: {
    data: Partial<BaseEntity<EntitySchema>>;
    options?: ExtraOptions & { returning: boolean };
  }): Promise<TNullable<BaseEntity<EntitySchema>>>;
  createAll(opts: {
    data: Partial<BaseEntity<EntitySchema>>[];
    options?: ExtraOptions & { returning: boolean };
  }): Promise<TNullable<Array<BaseEntity<EntitySchema>>>>;

  updateById(opts: {
    id: IdType;
    data: Partial<BaseEntity<EntitySchema>>;
    options?: ExtraOptions & { returning: boolean };
  }): Promise<TCount & TNullable<BaseEntity<EntitySchema>>>;
  updateAll(opts: {
    data: Partial<BaseEntity<EntitySchema>>;
    where?: TWhere<BaseEntity<EntitySchema>>;
    options?: ExtraOptions & { returning: boolean };
  }): Promise<TCount & TNullable<Array<BaseEntity<EntitySchema>>>>;

  deleteById(opts: {
    id: IdType;
    options?: ExtraOptions & { returning: boolean };
  }): Promise<TCount & TNullable<BaseEntity<EntitySchema>>>;
  deleteAll(opts: {
    where?: TWhere<BaseEntity<EntitySchema>>;
    options?: ExtraOptions & { returning: boolean };
  }): Promise<TCount & TNullable<BaseEntity<EntitySchema>>>;
}

// --------------------------------------------------------------------------------------
export interface IQueryHandlerOptions<T = any> {
  column: Column;
  value: T;
}

/* export interface ITzRepository<E extends TBaseTzEntity> extends IPersistableRepository<E> {
  mixTimestamp(entity: DataObject<E>, options?: { newInstance: boolean }): DataObject<E>;
  mixUserAudit(
    entity: DataObject<E>,
    options?: { newInstance: boolean; authorId: IdType },
  ): DataObject<E>;
} */
