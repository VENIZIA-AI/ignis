import type { AbstractDataSource } from '@/base/datasources';
import type { AbstractEntity, IdType } from '@/base/models';
import type { TFilter, TWhere } from '@venizia/ignis-filter';
import type { TNullable } from '@venizia/ignis-helpers/common';
import type { IExtraOptions, TFindOneOptions, TFindOptions, TFindRangeOptions } from './options';
import type { TCount, TDataWithRange } from './results';

/**
 * Base repository interface shared by every engine - engine-specific accessors (postgres's
 * `getEntitySchema()`/`getConnector()`) stay on the connector's own repository tier.
 */
export interface IRepository {
  dataSource: AbstractDataSource;
  entity: AbstractEntity;
  getEntity(): AbstractEntity;
}

/** Interface for read-only repository operations. `TDataObject` is the row/document shape itself. */
export interface IReadableRepository<
  TDataObject extends object = object,
  ExtraOptions extends IExtraOptions = IExtraOptions,
> extends IRepository {
  count(opts: { where: TWhere<TDataObject>; options?: ExtraOptions }): Promise<TCount>;
  existsWith(opts: { where: TWhere<TDataObject>; options?: ExtraOptions }): Promise<boolean>;

  find<R = TDataObject>(opts: {
    filter: TFilter<TDataObject>;
    options: TFindRangeOptions<ExtraOptions, R>;
  }): Promise<TDataWithRange<R>>;

  find<R = TDataObject>(opts: {
    filter: TFilter<TDataObject>;
    options?: TFindOptions<ExtraOptions, R>;
  }): Promise<Array<R>>;

  findOne<R = TDataObject>(opts: {
    filter: TFilter<TDataObject>;
    options?: TFindOneOptions<ExtraOptions, R>;
  }): Promise<TNullable<R>>;

  findById<R = TDataObject>(opts: {
    id: IdType;
    filter?: Omit<TFilter<TDataObject>, 'where'>;
    options?: TFindOneOptions<ExtraOptions, R>;
  }): Promise<TNullable<R>>;
}

/** Interface for create operations. */
export interface ICreatableRepository<
  TDataObject extends object = object,
  TPersistObject extends object = TDataObject,
  ExtraOptions extends IExtraOptions = IExtraOptions,
> extends IRepository {
  create(opts: {
    data: TPersistObject;
    options: ExtraOptions & { shouldReturn: false };
  }): Promise<TCount & { data: undefined | null }>;

  create<R = TDataObject>(opts: {
    data: TPersistObject;
    options?: ExtraOptions & { shouldReturn?: true };
  }): Promise<TCount & { data: R }>;

  createAll(opts: {
    data: Array<TPersistObject>;
    options: ExtraOptions & { shouldReturn: false };
  }): Promise<TCount & { data: undefined | null }>;

  createAll<R = TDataObject>(opts: {
    data: Array<TPersistObject>;
    options?: ExtraOptions & { shouldReturn?: true };
  }): Promise<TCount & { data: Array<R> }>;
}

/** Interface for update operations. */
export interface IUpdatableRepository<
  TDataObject extends object = object,
  TPersistObject extends object = TDataObject,
  ExtraOptions extends IExtraOptions = IExtraOptions,
> extends IRepository {
  updateById(opts: {
    id: IdType;
    data: Partial<TPersistObject>;
    options: ExtraOptions & { shouldReturn: false };
  }): Promise<TCount & { data: undefined | null }>;

  updateById<R = TDataObject>(opts: {
    id: IdType;
    data: Partial<TPersistObject>;
    options?: ExtraOptions & { shouldReturn?: true };
  }): Promise<TCount & { data: R }>;

  updateAll(opts: {
    data: Partial<TPersistObject>;
    where: TWhere<TDataObject>;
    options: ExtraOptions & { shouldReturn: false; force?: boolean };
  }): Promise<TCount & { data: undefined | null }>;

  updateAll<R = TDataObject>(opts: {
    data: Partial<TPersistObject>;
    where: TWhere<TDataObject>;
    options?: ExtraOptions & { shouldReturn?: true; force?: boolean };
  }): Promise<TCount & { data: Array<R> | null }>;

  /** Alias for updateAll. */
  updateBy(opts: {
    data: Partial<TPersistObject>;
    where: TWhere<TDataObject>;
    options: ExtraOptions & { shouldReturn: false; force?: boolean };
  }): Promise<TCount & { data: undefined | null }>;

  /** Alias for updateAll. */
  updateBy<R = TDataObject>(opts: {
    data: Partial<TPersistObject>;
    where: TWhere<TDataObject>;
    options?: ExtraOptions & { shouldReturn?: true; force?: boolean };
  }): Promise<TCount & { data: Array<R> | null }>;
}

/** Interface for delete operations. */
export interface IDeletableRepository<
  TDataObject extends object = object,
  ExtraOptions extends IExtraOptions = IExtraOptions,
> extends IRepository {
  deleteById(opts: {
    id: IdType;
    options: ExtraOptions & { shouldReturn: false };
  }): Promise<TCount & { data: undefined | null }>;

  deleteById<R = TDataObject>(opts: {
    id: IdType;
    options?: ExtraOptions & { shouldReturn?: true };
  }): Promise<TCount & { data: R }>;

  deleteAll(opts: {
    where?: TWhere<TDataObject>;
    options: ExtraOptions & { shouldReturn: false; force?: boolean };
  }): Promise<TCount & { data: undefined | null }>;

  deleteAll<R = TDataObject>(opts: {
    where?: TWhere<TDataObject>;
    options?: ExtraOptions & { shouldReturn?: true; force?: boolean };
  }): Promise<TCount & { data: Array<R> | null }>;

  /** Alias for deleteAll. */
  deleteBy(opts: {
    where?: TWhere<TDataObject>;
    options: ExtraOptions & { shouldReturn: false; force?: boolean };
  }): Promise<TCount & { data: undefined | null }>;

  /** Alias for deleteAll. */
  deleteBy<R = TDataObject>(opts: {
    where?: TWhere<TDataObject>;
    options?: ExtraOptions & { shouldReturn?: true; force?: boolean };
  }): Promise<TCount & { data: Array<R> | null }>;
}

/** Interface for full CRUD repository operations - reads plus create, update, and delete. */
export interface IPersistableRepository<
  TDataObject extends object = object,
  TPersistObject extends object = TDataObject,
  ExtraOptions extends IExtraOptions = IExtraOptions,
>
  extends
    IReadableRepository<TDataObject, ExtraOptions>,
    ICreatableRepository<TDataObject, TPersistObject, ExtraOptions>,
    IUpdatableRepository<TDataObject, TPersistObject, ExtraOptions>,
    IDeletableRepository<TDataObject, ExtraOptions> {}

/**
 * Alias for IPersistableRepository - the name both DefaultRelationalRepository and
 * DefaultSearchRepository satisfy.
 */
export interface ICrudRepository<
  TDataObject extends object = object,
  TPersistObject extends object = TDataObject,
  ExtraOptions extends IExtraOptions = IExtraOptions,
> extends IPersistableRepository<TDataObject, TPersistObject, ExtraOptions> {}
