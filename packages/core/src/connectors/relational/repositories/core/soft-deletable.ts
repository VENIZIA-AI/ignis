import type { IdType } from '@/base/models';
import type {
  IExtraOptions,
  TCount,
  TFilter,
  TFindOneOptions,
  TWhere,
} from '@/base/repositories/common';
import { RepositoryErrors } from '@/base/repositories/common';
import type { IRelationalDataSource } from '@/connectors/relational/datasources/common';
import type {
  TTableInsert,
  TTableObject,
  TTableSchemaWithId,
} from '@/connectors/relational/models';
import type { TNullable } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';
import type { AnyColumn } from 'drizzle-orm';
import type { IRelationalExtraOptions } from '../common';
import { DefaultRelationalRepository } from './default';

/** Drizzle's root `AnyColumn<TPartial>` is the exact dialect-free twin of `AnyPgColumn<TPartial>`, so a `timestamp('deleted_at')` still satisfies this bound. */
export type TDeletedAtColumn = AnyColumn<{
  data: Date | string | null;
}>;

export type TSoftDeletableTableSchema = TTableSchemaWithId & {
  deletedAt: TDeletedAtColumn;
};

/** Repository that soft-deletes (sets `deletedAt`) instead of physically removing rows; models need a `deletedAt` column and `defaultFilter: { where: { deletedAt: null } }` in `@model` settings. */
export class SoftDeletableRelationalRepository<
  EntitySchema extends TSoftDeletableTableSchema = TSoftDeletableTableSchema,
  DataObject extends TTableObject<EntitySchema> = TTableObject<EntitySchema>,
  PersistObject extends TTableInsert<EntitySchema> = TTableInsert<EntitySchema>,
  ExtraOptions extends IExtraOptions = IRelationalExtraOptions,
  TDataSource extends IRelationalDataSource = IRelationalDataSource,
> extends DefaultRelationalRepository<
  EntitySchema,
  DataObject,
  PersistObject,
  ExtraOptions,
  TDataSource
> {
  private softDeletePatch(deletedAt: Date | null): Partial<PersistObject> {
    return { deletedAt } as any;
  }

  /** `isStrict` is evaluated AFTER `options.retry` has been exhausted - the retry loop lives inside `super.findById` -> `findOne`, so a strict read waits out replica lag before it 404s. */
  override async findById<R = DataObject>(opts: {
    id: IdType;
    filter?: Omit<TFilter<DataObject>, 'where'>;
    options?: TFindOneOptions<ExtraOptions, R> & { isStrict?: false };
  }): Promise<TNullable<R>>;
  override async findById<R = DataObject>(opts: {
    id: IdType;
    filter?: Omit<TFilter<DataObject>, 'where'>;
    options?: TFindOneOptions<ExtraOptions, R> & { isStrict?: true };
  }): Promise<R>;
  override async findById<R = DataObject>(opts: {
    id: IdType;
    filter?: Omit<TFilter<DataObject>, 'where'>;
    options?: TFindOneOptions<ExtraOptions, R> & { isStrict?: boolean };
  }): Promise<TNullable<R>> {
    const result = await super.findById<R>(opts);

    if (opts.options?.isStrict && !result) {
      throw getError({
        error: RepositoryErrors.ENTITY_NOT_FOUND,
        message: `[${this.constructor.name}][findById] Entity with id ${opts.id} not found`,
        messageArgs: { id: opts.id },
      });
    }

    return result;
  }

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

  async restoreById<R = DataObject>(opts: {
    id: IdType;
    options?: ExtraOptions & { shouldReturn?: boolean };
  }): Promise<TCount & { data: TNullable<R> }> {
    this.validateId({ id: opts.id, operationName: 'restoreById' });
    const { shouldReturn = true, ...restOptions } = opts.options ?? {};

    // `updateById` is overloaded on the literal `shouldReturn: true | false` and the spread below widens it back to `boolean`, so this calls `_update` directly.
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

    // `updateAll` forwards straight to `_update`, so calling it here directly is behavior-identical.
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
