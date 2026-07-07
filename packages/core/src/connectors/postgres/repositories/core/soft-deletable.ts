import { IdType } from '@/base/models';
import { IExtraOptions, TCount, TFilter, TWhere } from '@/base/repositories/common';
import { TTableInsert, TTableObject, TTableSchemaWithId } from '@/connectors/postgres/models';
import { getError, HTTP, TNullable } from '@venizia/ignis-helpers';
import { AnyPgColumn } from 'drizzle-orm/pg-core';
import { IDatabaseExtraOptions } from '../common';
import { DefaultRelationalRepository } from './default';

export type TDeletedAtColumn = AnyPgColumn<{
  data: Date | string | null;
}>;

export type TSoftDeletableTableSchema = TTableSchemaWithId & {
  deletedAt: TDeletedAtColumn;
};

/** Repository that soft-deletes (sets `deletedAt`) instead of physically removing rows. Models need
 * a `deletedAt` column and `defaultFilter: { where: { deletedAt: null } }` in `@model` settings. */
export class SoftDeletableRelationalRepository<
  EntitySchema extends TSoftDeletableTableSchema = TSoftDeletableTableSchema,
  DataObject extends TTableObject<EntitySchema> = TTableObject<EntitySchema>,
  PersistObject extends TTableInsert<EntitySchema> = TTableInsert<EntitySchema>,
  ExtraOptions extends IExtraOptions = IDatabaseExtraOptions,
> extends DefaultRelationalRepository<EntitySchema, DataObject, PersistObject, ExtraOptions> {
  // ---------------------------------------------------------------------------
  private softDeletePatch(deletedAt: Date | null): Partial<PersistObject> {
    return { deletedAt } as any;
  }

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
      data: this.softDeletePatch(new Date()),
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
      data: this.softDeletePatch(new Date()),
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
      data: this.softDeletePatch(new Date()),
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
    this.validateId({ id: opts.id, operationName: 'restoreById' });
    const { shouldReturn = true, ...restOptions } = opts.options ?? {};

    // `updateById` is overloaded on the literal `shouldReturn: true | false`; the spread below
    // widens it back to `boolean`, so this calls `_update` directly instead - the same move
    // `createAll` makes into `_create` for the equivalent widened-options cast.
    const options = {
      ...restOptions,
      shouldReturn,
      shouldSkipDefaultFilter: true,
    } as ExtraOptions & {
      shouldReturn: boolean;
    };
    const rs = await this._update<R>({
      where: { id: opts.id },
      data: this.softDeletePatch(null),
      options,
    });
    return { count: rs.count, data: rs.data?.[0] ?? null };
  }

  async restoreAll<R = DataObject>(opts: {
    where?: TWhere<DataObject>;
    options?: ExtraOptions & { shouldReturn?: boolean; force?: boolean };
  }): Promise<TCount & { data: TNullable<Array<R>> }> {
    const { shouldReturn = true, force, ...restOptions } = opts.options ?? {};

    // `updateAll` forwards straight to `_update`, so calling it here directly is behavior-identical -
    // it just accepts the widened (non-literal) `shouldReturn: boolean` `_update` itself declares.
    const options = {
      ...restOptions,
      shouldReturn,
      force,
      shouldSkipDefaultFilter: true,
    } as ExtraOptions & {
      shouldReturn: boolean;
      force?: boolean;
    };
    return this._update<R>({ where: opts.where ?? {}, data: this.softDeletePatch(null), options });
  }

  async restoreBy<R = DataObject>(opts: {
    where: TWhere<DataObject>;
    options?: ExtraOptions & { shouldReturn?: boolean; force?: boolean };
  }): Promise<TCount & { data: TNullable<Array<R>> }> {
    return this.restoreAll<R>(opts);
  }
}
