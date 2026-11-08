import type {
  IExtraOptions,
  TByIdFilter,
  TCount,
  TFields,
  TFindOneOptions,
  TRow,
  TWhere,
} from '@venizia/ignis-kernel';
import { RepositoryErrors, ScopeOperations } from '@venizia/ignis-kernel';
import type { IRelationalDataSource } from '@/relational/core/datasources/common';
import type { TTableInsert, TTableObject, TTableSchemaWithId } from '@/relational/core/models';
import { AuditFields } from '@/relational/core/models/common/constants';
import type { TNullable } from '@venizia/ignis-helpers/common';
import { HTTP } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';
import type { AnyColumn, Column } from 'drizzle-orm';
import { getTableColumns } from 'drizzle-orm';
import type { IRelationalExtraOptions } from '../common';
import { DefaultRelationalRepository } from './default';

/** Drizzle's root `AnyColumn<TPartial>` is the exact dialect-free twin of `AnyPgColumn<TPartial>`, so a `timestamp('deleted_at')` still satisfies this bound. */
export type TDeletedAtColumn = AnyColumn<{
  data: Date | string | null;
}>;

/** A table schema with an `id` column and a nullable `deletedAt` column, as soft deletion requires. */
export type TSoftDeletableTableSchema = TTableSchemaWithId & {
  deletedAt: TDeletedAtColumn;
};

/** Repository that soft-deletes (sets `deletedAt`) instead of physically removing rows; models need a `deletedAt` column and `query: { filter: { where: { deletedAt: null } } }` in `@model` settings. */
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
  private softDeletePatch(opts: {
    data?: Partial<Omit<PersistObject, 'deletedAt'>>;
    deletedAt: Date | null;
  }): Partial<PersistObject> {
    return { ...opts.data, deletedAt: opts.deletedAt } as any;
  }

  /** Refuses `data` that carries the soft-delete column, by property or column name, with any value: it changes only through the delete and restore calls. */
  protected override validateUpdateData(opts: { data: object }): void {
    const columns: Record<string, Column | undefined> = getTableColumns(this.entity.schema);
    const names = [AuditFields.DELETED_AT, columns[AuditFields.DELETED_AT]?.name];
    const carries = Object.entries(opts.data).some(
      ([key, value]) => value !== undefined && names.includes(key),
    );

    if (!carries) {
      return;
    }

    throw getError({
      statusCode: HTTP.ResultCodes.RS_4.BadRequest,
      message: `${AuditFields.DELETED_AT} changes only through deleteById/deleteAll/deleteBy and restoreById/restoreAll/restoreBy`,
    });
  }

  /** A soft delete writes `data` in the same statement as `deletedAt`: `data` may not carry `deletedAt`, and a hard delete writes nothing. */
  private validateDeleteData(opts: {
    data?: Partial<Omit<PersistObject, 'deletedAt'>>;
    shouldHardDelete?: boolean;
  }): void {
    if (opts.data === undefined) {
      return;
    }

    if (opts.shouldHardDelete) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_4.BadRequest,
        message: 'data is written by a soft delete; it cannot be combined with shouldHardDelete',
      });
    }

    this.validateUpdateData({ data: opts.data });
  }

  /** `isStrict` is evaluated AFTER `options.retry` has been exhausted - the retry loop lives inside `super.findById` -> `findOne`, so a strict read waits out replica lag before it 404s. */
  override async findById<
    R = unknown,
    const F extends TFields<DataObject> = TFields<DataObject>,
  >(opts: {
    id: DataObject['id'];
    filter?: TByIdFilter<DataObject, F>;
    options?: TFindOneOptions<ExtraOptions, TRow<DataObject, R, F>> & { isStrict?: false };
  }): Promise<TNullable<TRow<DataObject, R, F>>>;
  override async findById<
    R = unknown,
    const F extends TFields<DataObject> = TFields<DataObject>,
  >(opts: {
    id: DataObject['id'];
    filter?: TByIdFilter<DataObject, F>;
    options?: TFindOneOptions<ExtraOptions, TRow<DataObject, R, F>> & { isStrict?: true };
  }): Promise<TRow<DataObject, R, F>>;
  override async findById<
    R = unknown,
    const F extends TFields<DataObject> = TFields<DataObject>,
  >(opts: {
    id: DataObject['id'];
    filter?: TByIdFilter<DataObject, F>;
    options?: TFindOneOptions<ExtraOptions, TRow<DataObject, R, F>> & { isStrict?: boolean };
  }): Promise<TNullable<TRow<DataObject, R, F>>> {
    const result = await super.findById<R, F>(opts);

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
    id: DataObject['id'];
    data?: Partial<Omit<PersistObject, 'deletedAt'>>;
    options: ExtraOptions & { shouldReturn: false; shouldHardDelete?: boolean };
  }): Promise<TCount & { data: undefined | null }>;
  override deleteById<R = DataObject>(opts: {
    id: DataObject['id'];
    data?: Partial<Omit<PersistObject, 'deletedAt'>>;
    options?: ExtraOptions & { shouldReturn?: true; shouldHardDelete?: boolean };
  }): Promise<TCount & { data: R }>;
  override async deleteById<R = DataObject>(opts: {
    id: DataObject['id'];
    data?: Partial<Omit<PersistObject, 'deletedAt'>>;
    options?: ExtraOptions & { shouldReturn?: boolean; shouldHardDelete?: boolean };
  }): Promise<TCount & { data: TNullable<R> }> {
    this.validateDeleteData({ data: opts.data, shouldHardDelete: opts.options?.shouldHardDelete });

    if (opts.options?.shouldHardDelete) {
      return super.deleteById<R>(opts);
    }

    this.validateId({ id: opts.id, operationName: 'deleteById' });

    // A soft delete is a delete to the row scope: it passes DELETE, not UPDATE.
    const rs = await this._update<R>({
      where: this.whereById({ id: opts.id }),
      data: this.softDeletePatch({ data: opts.data, deletedAt: new Date() }),
      options: opts.options,
      operation: ScopeOperations.DELETE,
    });

    return { count: rs.count, data: rs.data?.[0] ?? null };
  }

  override deleteAll(opts: {
    where?: TWhere<DataObject>;
    data?: Partial<Omit<PersistObject, 'deletedAt'>>;
    options: ExtraOptions & { shouldReturn: false; force?: boolean; shouldHardDelete?: boolean };
  }): Promise<TCount & { data: undefined | null }>;
  override deleteAll<R = DataObject>(opts: {
    where?: TWhere<DataObject>;
    data?: Partial<Omit<PersistObject, 'deletedAt'>>;
    options?: ExtraOptions & { shouldReturn?: true; force?: boolean; shouldHardDelete?: boolean };
  }): Promise<TCount & { data: Array<R> }>;
  override async deleteAll<R = DataObject>(opts: {
    where?: TWhere<DataObject>;
    data?: Partial<Omit<PersistObject, 'deletedAt'>>;
    options?: ExtraOptions & {
      shouldReturn?: boolean;
      force?: boolean;
      shouldHardDelete?: boolean;
    };
  }): Promise<TCount & { data: TNullable<Array<R>> }> {
    this.validateDeleteData({ data: opts.data, shouldHardDelete: opts.options?.shouldHardDelete });

    if (opts.options?.shouldHardDelete) {
      return super.deleteAll<R>(opts);
    }

    return this._update<R>({
      where: opts.where ?? {},
      data: this.softDeletePatch({ data: opts.data, deletedAt: new Date() }),
      options: opts.options,
      operation: ScopeOperations.DELETE,
    });
  }

  override deleteBy(opts: {
    where: TWhere<DataObject>;
    data?: Partial<Omit<PersistObject, 'deletedAt'>>;
    options: ExtraOptions & { shouldReturn: false; force?: boolean; shouldHardDelete?: boolean };
  }): Promise<TCount & { data: undefined | null }>;
  override deleteBy<R = DataObject>(opts: {
    where: TWhere<DataObject>;
    data?: Partial<Omit<PersistObject, 'deletedAt'>>;
    options?: ExtraOptions & { shouldReturn?: true; force?: boolean; shouldHardDelete?: boolean };
  }): Promise<TCount & { data: Array<R> }>;
  override async deleteBy<R = DataObject>(opts: {
    where: TWhere<DataObject>;
    data?: Partial<Omit<PersistObject, 'deletedAt'>>;
    options?: ExtraOptions & {
      shouldReturn?: boolean;
      force?: boolean;
      shouldHardDelete?: boolean;
    };
  }): Promise<TCount & { data: TNullable<Array<R>> }> {
    this.validateDeleteData({ data: opts.data, shouldHardDelete: opts.options?.shouldHardDelete });

    if (opts.options?.shouldHardDelete) {
      return super.deleteBy<R>(opts);
    }

    return this._update<R>({
      where: opts.where,
      data: this.softDeletePatch({ data: opts.data, deletedAt: new Date() }),
      options: opts.options,
      operation: ScopeOperations.DELETE,
    });
  }

  /**
   * Clears `deletedAt` on the soft-deleted row with this `id`.
   * @example
   * ```typescript
   * import { SoftDeletableRepository } from '@venizia/ignis-connectors/postgres';
   * import { pgTable, serial, timestamp } from 'drizzle-orm/pg-core';
   *
   * const users = pgTable('User', { id: serial('id').primaryKey(), deletedAt: timestamp('deleted_at') });
   * declare const repo: SoftDeletableRepository<typeof users>;
   * const { data } = await repo.restoreById({ id: 1 });
   * ```
   */
  async restoreById<R = DataObject>(opts: {
    id: DataObject['id'];
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
      where: this.whereById({ id: opts.id }),
      data: this.softDeletePatch({ deletedAt: null }),
      options,
    });

    return { count: rs.count, data: rs.data?.[0] ?? null };
  }

  /**
   * Clears `deletedAt` on the soft-deleted rows matching `where`; an empty `where` needs `options.force`.
   * @example
   * ```typescript
   * import { SoftDeletableRepository } from '@venizia/ignis-connectors/postgres';
   * import { pgTable, serial, timestamp } from 'drizzle-orm/pg-core';
   *
   * const users = pgTable('User', { id: serial('id').primaryKey(), deletedAt: timestamp('deleted_at') });
   * declare const repo: SoftDeletableRepository<typeof users>;
   * await repo.restoreAll({ where: { id: { gt: 10 } } });
   * await repo.restoreAll({ options: { force: true, shouldReturn: false } });
   * ```
   */
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

    return this._update<R>({
      where: opts.where ?? {},
      data: this.softDeletePatch({ deletedAt: null }),
      options,
    });
  }

  /**
   * Clears `deletedAt` on the soft-deleted rows matching `where`.
   * @example
   * ```typescript
   * import { SoftDeletableRepository } from '@venizia/ignis-connectors/postgres';
   * import { pgTable, serial, timestamp } from 'drizzle-orm/pg-core';
   *
   * const users = pgTable('User', { id: serial('id').primaryKey(), deletedAt: timestamp('deleted_at') });
   * declare const repo: SoftDeletableRepository<typeof users>;
   * const { count } = await repo.restoreBy({ where: { id: { inq: [1, 2] } } });
   * ```
   */
  async restoreBy<R = DataObject>(opts: {
    where: TWhere<DataObject>;
    options?: ExtraOptions & { shouldReturn?: boolean; force?: boolean };
  }): Promise<TCount & { data: TNullable<Array<R>> }> {
    return this.restoreAll<R>(opts);
  }
}
