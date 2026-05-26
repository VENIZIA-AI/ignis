import { IdType, TTableInsert, TTableObject, TTableSchemaWithId } from '@/base/models';
import { getError, HTTP, TNullable } from '@venizia/ignis-helpers';
import { AnyPgColumn } from 'drizzle-orm/pg-core';
import { IExtraOptions, TCount, TFilter, TWhere } from '../common';
import { DefaultCRUDRepository } from './default-crud';

export type TDeletedAtColumn = AnyPgColumn<{
  data: Date | string | null;
}>;

export type TSoftDeletableTableSchema = TTableSchemaWithId & {
  deletedAt: TDeletedAtColumn;
};

/**
 * Soft-deletable repository that overrides delete operations to set deletedAt timestamp
 * instead of physically removing records from the database.
 *
 * Models using this repository should:
 * - Have a `deletedAt` column (Date | null)
 * - Set `defaultFilter: { where: { deletedAt: null } }` in @model settings
 * - Include `deletedAt` in `hiddenProperties` if you don't want to expose it
 *
 * @example
 * ```typescript
 * @model({
 *   settings: {
 *     hiddenProperties: ['deletedAt'],
 *     defaultFilter: { where: { deletedAt: null } },
 *   },
 * })
 * export class Category extends BaseEntity<typeof Category.schema> {
 *   static schema = pgTable('Category', {
 *     ...withTimestamps(),
 *     ...withSoftDelete(),
 *   });
 * }
 *
 * @repository({ dataSource: PostgresDataSource, model: Category })
 * export class CategoryRepository extends SoftDeletableRepository<typeof Category.schema> {}
 * ```
 */
export class SoftDeletableRepository<
  EntitySchema extends TSoftDeletableTableSchema = TSoftDeletableTableSchema,
  DataObject extends TTableObject<EntitySchema> = TTableObject<EntitySchema>,
  PersistObject extends TTableInsert<EntitySchema> = TTableInsert<EntitySchema>,
  ExtraOptions extends IExtraOptions = IExtraOptions,
> extends DefaultCRUDRepository<EntitySchema, DataObject, PersistObject, ExtraOptions> {
  // ---------------------------------------------------------------------------
  // Read Operations
  // ---------------------------------------------------------------------------

  override async findById<R = DataObject>(opts: {
    id: IdType;
    filter?: Omit<TFilter<DataObject>, 'where'>;
    options?: ExtraOptions & { isStrict?: false };
  }): Promise<TNullable<R>>;
  override async findById<R = DataObject>(opts: {
    id: IdType;
    filter?: Omit<TFilter<DataObject>, 'where'>;
    options?: ExtraOptions & { isStrict?: true };
  }): Promise<R>;
  override async findById<R = DataObject>(opts: {
    id: IdType;
    filter?: Omit<TFilter<DataObject>, 'where'>;
    options?: ExtraOptions & { isStrict?: boolean };
  }): Promise<TNullable<R>> {
    const result = await super.findById<R>(opts);

    if (opts.options?.isStrict && !result) {
      throw getError({
        message: `[${this.constructor.name}][findById] Entity with id ${opts.id} not found`,
        statusCode: HTTP.ResultCodes.RS_4.NotFound,
      });
    }

    return result;
  }

  // ---------------------------------------------------------------------------
  // Delete Operations
  // ---------------------------------------------------------------------------

  override deleteById(opts: {
    id: IdType;
    options: ExtraOptions & { shouldReturn: false; shouldHardDelete?: boolean };
  }): Promise<TCount & { data: undefined | null }>;
  override deleteById<R = DataObject>(opts: {
    id: IdType;
    options?: ExtraOptions & { shouldReturn?: true; shouldHardDelete?: boolean };
  }): Promise<TCount & { data: R }>;
  override async deleteById<R = DataObject>(opts: {
    id: IdType;
    options?: ExtraOptions & { shouldReturn?: boolean; shouldHardDelete?: boolean };
  }): Promise<TCount & { data: TNullable<R> }> {
    if (opts.options?.shouldHardDelete) {
      return super.deleteById<R>(opts);
    }

    return this.updateById<R>({
      id: opts.id,
      data: { deletedAt: new Date() } as unknown as Partial<PersistObject>,
      options: opts.options,
    });
  }

  override deleteAll(opts: {
    where?: TWhere<DataObject>;
    options: ExtraOptions & { shouldReturn: false; force?: boolean; shouldHardDelete?: boolean };
  }): Promise<TCount & { data: undefined | null }>;
  override deleteAll<R = DataObject>(opts: {
    where?: TWhere<DataObject>;
    options?: ExtraOptions & { shouldReturn?: true; force?: boolean; shouldHardDelete?: boolean };
  }): Promise<TCount & { data: Array<R> }>;
  override deleteAll<R = DataObject>(opts: {
    where?: TWhere<DataObject>;
    options?: ExtraOptions & {
      shouldReturn?: boolean;
      force?: boolean;
      shouldHardDelete?: boolean;
    };
  }): Promise<TCount & { data: TNullable<Array<R>> }> {
    if (opts.options?.shouldHardDelete) {
      return super.deleteAll<R>(opts);
    }

    return this.updateAll<R>({
      where: opts.where ?? {},
      data: { deletedAt: new Date() } as unknown as Partial<PersistObject>,
      options: opts.options,
    });
  }

  override deleteBy(opts: {
    where: TWhere<DataObject>;
    options: ExtraOptions & { shouldReturn: false; force?: boolean; shouldHardDelete?: boolean };
  }): Promise<TCount & { data: undefined | null }>;
  override deleteBy<R = DataObject>(opts: {
    where: TWhere<DataObject>;
    options?: ExtraOptions & { shouldReturn?: true; force?: boolean; shouldHardDelete?: boolean };
  }): Promise<TCount & { data: Array<R> }>;
  override deleteBy<R = DataObject>(opts: {
    where: TWhere<DataObject>;
    options?: ExtraOptions & {
      shouldReturn?: boolean;
      force?: boolean;
      shouldHardDelete?: boolean;
    };
  }): Promise<TCount & { data: TNullable<Array<R>> }> {
    if (opts.options?.shouldHardDelete) {
      return super.deleteBy<R>(opts);
    }

    return this.updateAll<R>({
      where: opts.where,
      data: { deletedAt: new Date() } as unknown as Partial<PersistObject>,
      options: opts.options,
    });
  }

  // ---------------------------------------------------------------------------
  // Restore Operations
  // ---------------------------------------------------------------------------

  async restoreById<R = DataObject>(opts: {
    id: IdType;
    options?: ExtraOptions & { shouldReturn?: boolean };
  }): Promise<TCount & { data: TNullable<R> }> {
    const { shouldReturn = true, ...restOptions } = opts.options ?? {};
    return this.updateById<R>({
      id: opts.id,
      data: { deletedAt: null } as unknown as Partial<PersistObject>,
      options: { ...restOptions, shouldReturn, shouldSkipDefaultFilter: true } as any,
    });
  }

  async restoreAll<R = DataObject>(opts: {
    where?: TWhere<DataObject>;
    options?: ExtraOptions & { shouldReturn?: boolean; force?: boolean };
  }): Promise<TCount & { data: TNullable<Array<R>> }> {
    const { shouldReturn = true, force, ...restOptions } = opts.options ?? {};
    return this.updateAll<R>({
      where: opts.where ?? {},
      data: { deletedAt: null } as unknown as Partial<PersistObject>,
      options: { ...restOptions, shouldReturn, force, shouldSkipDefaultFilter: true } as any,
    });
  }

  async restoreBy<R = DataObject>(opts: {
    where: TWhere<DataObject>;
    options?: ExtraOptions & { shouldReturn?: boolean; force?: boolean };
  }): Promise<TCount & { data: TNullable<Array<R>> }> {
    return this.restoreAll<R>(opts);
  }
}
