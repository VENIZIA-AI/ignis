import { AnyObject } from '@/common/types';
import { IdType, TBaseIdEntity } from '../models';

// ----------------------------------------------------------------------------------------------------------------------------------------
// Repository Interfaces
// ----------------------------------------------------------------------------------------------------------------------------------------
export interface IFilter<T = any> {
  where?: TWhere<T>;
  fields?: TFields<T>;
  include?: IInclusion[];
  order?: string | string[];
  limit?: number;
  offset?: number;
  skip?: number;
}

export type TWhere<T = any> = {
  [key in keyof T]: any;
} & {
  and?: TWhere<T>[];
  or?: TWhere<T>[];
};

export type TFields<T = any> = {
  [K in keyof T]?: boolean;
};

export interface IInclusion {
  relation: string;
  scope?: IFilter;
}

export interface ICount {
  count: number;
}

export type DataObject<T> = Partial<T>;

export interface IRepository {}

export interface IPersistableRepository<E extends TBaseIdEntity> extends IRepository {
  findOne(filter?: IFilter<E>, options?: AnyObject): Promise<E | null>;

  existsWith(where?: TWhere<any>, options?: AnyObject): Promise<boolean>;

  create(data: DataObject<E>, options?: AnyObject): Promise<E>;
  createAll(datum: DataObject<E>[], options?: AnyObject): Promise<E[]>;
  createWithReturn(data: DataObject<E>, options?: AnyObject): Promise<E>;

  updateById(id: IdType, data: DataObject<E>, options?: AnyObject): Promise<void>;
  updateWithReturn(id: IdType, data: DataObject<E>, options?: AnyObject): Promise<E>;
  updateAll(data: DataObject<E>, where?: TWhere<any>, options?: AnyObject): Promise<ICount>;

  upsertWith(data: DataObject<E>, where: TWhere<any>, options?: AnyObject): Promise<E | null>;
  replaceById(id: IdType, data: DataObject<E>, options?: AnyObject): Promise<void>;
}

/* export interface ITzRepository<E extends TBaseTzEntity> extends IPersistableRepository<E> {
  mixTimestamp(entity: DataObject<E>, options?: { newInstance: boolean }): DataObject<E>;
  mixUserAudit(
    entity: DataObject<E>,
    options?: { newInstance: boolean; authorId: IdType },
  ): DataObject<E>;
} */
