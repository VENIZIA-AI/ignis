import { IDataSource } from '@/base/datasources';
import { BaseEntity, IdType, TTableInsert, TTableObject, TTableSchemaWithId } from '@/base/models';
import { TNullable, ValueOptional } from '@/common/types';
import { Column, SQL } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Repository Interfaces
// ---------------------------------------------------------------------------
export type TFilter<T = any> = {
  where?: TWhere<T>;
  fields?: TFields<T>;
  include?: TInclusion[];
  order?: string[];
  limit?: number;
  offset?: number;
  skip?: number;
};

export type DrizzleQueryOptions = Partial<{
  limit: number;
  offset: number;
  orderBy: SQL[];
  where: SQL;
  with: Record<string, boolean | DrizzleQueryOptions>;
  columns: Record<string, boolean>;
}>;

export type TWhere<T = any> = { [key in keyof T]?: any } & { and?: TWhere<T>[]; or?: TWhere<T>[] };

export type TFields<T = any> = Partial<{ [K in keyof T]: boolean }>;

export type TInclusion = ValueOptional<{ relation: string; scope: TFilter }, 'scope'>;

export type TCount = { count: number };

// ---------------------------------------------------------------------------
export interface IRepository<EntitySchema extends TTableSchemaWithId> {
  dataSource: IDataSource;
  entity: BaseEntity<EntitySchema>;

  getEntity(): BaseEntity<EntitySchema>;
  getEntitySchema(): EntitySchema;
  getConnector(): IDataSource['connector'];
}

export interface IReadableRepository<
  EntitySchema extends TTableSchemaWithId,
  DataObject extends TTableObject<EntitySchema> = TTableObject<EntitySchema>,
  ExtraOptions extends TNullable<object> = undefined,
> extends IRepository<EntitySchema> {
  count(opts: { where: TWhere<DataObject>; options?: ExtraOptions }): Promise<TCount>;
  existsWith(opts: { where: TWhere<DataObject>; options?: ExtraOptions }): Promise<boolean>;

  find(opts: { filter: TFilter<DataObject>; options?: ExtraOptions }): Promise<Array<DataObject>>;
  findOne(opts: {
    filter: TFilter<DataObject>;
    options?: ExtraOptions;
  }): Promise<TNullable<DataObject>>;
  findById(opts: {
    id: IdType;
    filter?: Exclude<TFilter<DataObject>, 'where'>;
    options?: ExtraOptions;
  }): Promise<TNullable<DataObject>>;
}

export interface IPersistableRepository<
  EntitySchema extends TTableSchemaWithId,
  DataObject extends TTableObject<EntitySchema> = TTableObject<EntitySchema>,
  PersistObject extends TTableInsert<EntitySchema> = TTableInsert<EntitySchema>,
  ExtraOptions extends TNullable<object> = undefined,
> extends IReadableRepository<EntitySchema, DataObject, ExtraOptions> {
  create(opts: {
    data: PersistObject;
    options?: (ExtraOptions | {}) & { returning?: boolean };
  }): Promise<TCount & { data: TNullable<EntitySchema['$inferSelect']> }>;
  createAll(opts: {
    data: Array<PersistObject>;
    options?: (ExtraOptions | {}) & { returning?: boolean };
  }): Promise<TCount & { data: TNullable<Array<EntitySchema['$inferSelect']>> }>;

  updateById(opts: {
    id: IdType;
    data: Partial<PersistObject>;
    options?: (ExtraOptions | {}) & { returning?: boolean };
  }): Promise<TCount & { data: TNullable<EntitySchema['$inferSelect']> }>;
  updateAll(opts: {
    data: Partial<PersistObject>;
    where: TWhere<DataObject>;
    options?: (ExtraOptions | {}) & { returning?: boolean; force?: boolean };
  }): Promise<TCount & { data: TNullable<Array<EntitySchema['$inferSelect']>> }>;
  updateBy(opts: {
    data: Partial<PersistObject>;
    where: TWhere<DataObject>;
    options?: (ExtraOptions | {}) & { returning?: boolean; force?: boolean };
  }): Promise<TCount & { data: TNullable<Array<EntitySchema['$inferSelect']>> }>;

  deleteById(opts: {
    id: IdType;
    options?: (ExtraOptions | {}) & { returning?: boolean };
  }): Promise<TCount & { data: TNullable<EntitySchema['$inferSelect']> }>;
  deleteAll(opts: {
    where?: TWhere<DataObject>;
    options?: (ExtraOptions | {}) & { returning?: boolean; force?: boolean };
  }): Promise<TCount & { data: TNullable<Array<EntitySchema['$inferSelect']>> }>;
  deleteBy(opts: {
    where?: TWhere<DataObject>;
    options?: (ExtraOptions | {}) & { returning?: boolean; force?: boolean };
  }): Promise<TCount & { data: TNullable<Array<EntitySchema['$inferSelect']>> }>;
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
