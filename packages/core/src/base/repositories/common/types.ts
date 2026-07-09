import type { AbstractDataSource, ITransaction } from '@/base/datasources';
import type { AbstractEntity, IdType } from '@/base/models';
import { z } from '@hono/zod-openapi';
import type { TLogLevel, TNullable } from '@venizia/ignis-helpers';
import type { Column, SQL } from 'drizzle-orm';
import type { TFilter, TWhere } from '../query-schemas';
import type { TLockStrength } from './constants';

/** Update data supporting both regular fields and JSON path updates via dot notation. */
export type TUpdateData<T = any> = Partial<T> & {
  [jsonPath: string]: any;
};

/** Zod schema for count operation results. */
export const CountSchema = z.object({ count: z.number().default(0) }).openapi({
  description: 'Total count of items matching the criteria.',
  examples: [{ count: 0 }, { count: 10 }],
});

export type TCount = z.infer<typeof CountSchema>;

/** Data range information for paginated queries. Follows HTTP Content-Range standard. */
export type TDataRange = {
  start: number;
  end: number;
  total: number;
};

/** Options for Drizzle ORM query building, used internally by FilterBuilder. */
export type TDrizzleQueryOptions = Partial<{
  limit: number;
  offset: number;
  orderBy: SQL[];
  where: SQL;
  with: Record<string, true | TDrizzleQueryOptions>;
  columns: Record<string, boolean>;
}>;

/** Configuration for repository operation logging. */
export type TRepositoryLogOptions = {
  use: boolean;
  level?: TLogLevel;
};

/** Configuration for row-level lock wait behavior. Mutually exclusive: use noWait OR skipLocked. */
export type TLockConfig =
  | { noWait: true; skipLocked?: undefined }
  | { noWait?: undefined; skipLocked: true }
  | { noWait?: undefined; skipLocked?: undefined };

/** Row-level locking options for read operations. */
export type TLockOptions = {
  strength: TLockStrength;
  config?: TLockConfig;
};

/** Interface for objects that can be associated with a database transaction. Neutral - postgres
 * narrows to its own `IDatabaseTransaction` internally (via `isDatabaseTransaction`) where it needs `.connector`. */
export interface IWithTransaction {
  transaction?: ITransaction;
}

/** Extended options for repository operations with transaction, logging, and default filter bypass. */
export interface IExtraOptions extends IWithTransaction {
  log?: TRepositoryLogOptions;

  /** If true, bypass the default filter configured in model settings (e.g., soft delete). */
  shouldSkipDefaultFilter?: boolean;

  /** Row-level locking. Requires transaction. Incompatible with include/fields (Query API). */
  lock?: TLockOptions;
}

/** Base repository interface shared by every engine. Engine-specific accessors (postgres's
 * `getEntitySchema()`/`getConnector()`) stay on the connector's own repository tier. */
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
    options: ExtraOptions & { shouldQueryRange: true };
  }): Promise<{ data: Array<R>; range: TDataRange }>;

  find<R = TDataObject>(opts: {
    filter: TFilter<TDataObject>;
    options?: ExtraOptions & { shouldQueryRange?: false };
  }): Promise<Array<R>>;

  findOne<R = TDataObject>(opts: {
    filter: TFilter<TDataObject>;
    options?: ExtraOptions;
  }): Promise<TNullable<R>>;

  findById<R = TDataObject>(opts: {
    id: IdType;
    filter?: Omit<TFilter<TDataObject>, 'where'>;
    options?: ExtraOptions;
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
  }): Promise<TCount & { data: Array<R> }>;

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
  }): Promise<TCount & { data: Array<R> }>;
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
  }): Promise<TCount & { data: Array<R> }>;

  /** Alias for deleteAll. */
  deleteBy(opts: {
    where?: TWhere<TDataObject>;
    options: ExtraOptions & { shouldReturn: false; force?: boolean };
  }): Promise<TCount & { data: undefined | null }>;

  /** Alias for deleteAll. */
  deleteBy<R = TDataObject>(opts: {
    where?: TWhere<TDataObject>;
    options?: ExtraOptions & { shouldReturn?: true; force?: boolean };
  }): Promise<TCount & { data: Array<R> }>;
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

/** Alias for IPersistableRepository (already the full create/read/update/delete surface) - the
 * name both DefaultRelationalRepository and DefaultSearchRepository are meant to satisfy. */
export interface ICrudRepository<
  TDataObject extends object = object,
  TPersistObject extends object = TDataObject,
  ExtraOptions extends IExtraOptions = IExtraOptions,
> extends IPersistableRepository<TDataObject, TPersistObject, ExtraOptions> {}

/** Options passed to query operator handler functions. */
export interface IQueryHandlerOptions<T = any> {
  column: Column;
  value: T;
}
