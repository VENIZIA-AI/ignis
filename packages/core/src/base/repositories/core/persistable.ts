import { IDataSource } from '@/base/datasources';
import { BaseEntity, IdType, TTableInsert, TTableObject, TTableSchemaWithId } from '@/base/models';
import { getError, TClass, TNullable } from '@venizia/ignis-helpers';
import isEmpty from 'lodash/isEmpty';
import {
  RepositoryOperationScopes,
  TCount,
  TRepositoryLogOptions,
  TTransactionOption,
  TWhere,
} from '../common';
import { ReadableRepository } from './readable';

/**
 * Persistable repository with full CRUD operations.
 */
export class PersistableRepository<
  EntitySchema extends TTableSchemaWithId = TTableSchemaWithId,
  DataObject extends TTableObject<EntitySchema> = TTableObject<EntitySchema>,
  PersistObject extends TTableInsert<EntitySchema> = TTableInsert<EntitySchema>,
  ExtraOptions extends TTransactionOption = TTransactionOption,
> extends ReadableRepository<EntitySchema, DataObject, PersistObject, ExtraOptions> {
  constructor(ds?: IDataSource, opts?: { entityClass?: TClass<BaseEntity<EntitySchema>> }) {
    super(ds, { entityClass: opts?.entityClass });
    this.operationScope = RepositoryOperationScopes.READ_WRITE;
  }

  protected async _create<R = EntitySchema['$inferSelect']>(opts: {
    data: Array<PersistObject>;
    options: ExtraOptions & { shouldReturn?: boolean; log?: TRepositoryLogOptions };
  }): Promise<TCount & { data: TNullable<Array<R>> }> {
    const { shouldReturn = true, log, transaction } = opts.options ?? {};

    if (log?.use) {
      this.logger.log(log.level ?? 'info', '[_create] Executing with opts: %j', opts);
    }

    const connector = this.resolveConnector(transaction);
    const query = connector.insert(this.entity.schema).values(opts.data);

    if (!shouldReturn) {
      const rs = await query;
      this.logger.debug('[_create] INSERT result | shouldReturn: %s | rs: %j', shouldReturn, rs);
      return { count: rs.rowCount ?? 0, data: null };
    }

    // const rs = (await query.returning()) as unknown as Array<R>;
    const rs = (await query.returning()) as unknown as Array<R>;
    this.logger.debug('[_create] INSERT result | shouldReturn: %s | rs: %j', shouldReturn, rs);
    return { count: rs.length, data: rs };
  }

  // ---------------------------------------------------------------------------
  override create(opts: {
    data: PersistObject;
    options: ExtraOptions & { shouldReturn: false; log?: TRepositoryLogOptions };
  }): Promise<TCount & { data: null }>;
  override create<R = EntitySchema['$inferSelect']>(opts: {
    data: PersistObject;
    options?: ExtraOptions & { shouldReturn?: true; log?: TRepositoryLogOptions };
  }): Promise<TCount & { data: R }>;
  override async create<R = EntitySchema['$inferSelect']>(opts: {
    data: PersistObject;
    options?: ExtraOptions & { shouldReturn?: boolean; log?: TRepositoryLogOptions };
  }): Promise<TCount & { data: TNullable<R> }> {
    const options = {
      shouldReturn: true,
      ...opts.options,
    } as ExtraOptions & { shouldReturn: boolean };
    const rs = await this._create<R>({ data: [opts.data], options });
    return { count: rs.count, data: rs.data?.[0] ?? null };
  }

  // ---------------------------------------------------------------------------
  override createAll(opts: {
    data: Array<PersistObject>;
    options: ExtraOptions & { shouldReturn: false; log?: TRepositoryLogOptions };
  }): Promise<TCount & { data: null }>;
  override createAll<R = EntitySchema['$inferSelect']>(opts: {
    data: Array<PersistObject>;
    options?: ExtraOptions & { shouldReturn?: true; log?: TRepositoryLogOptions };
  }): Promise<TCount & { data: Array<R> }>;
  override createAll<R = EntitySchema['$inferSelect']>(opts: {
    data: Array<PersistObject>;
    options?: ExtraOptions & { shouldReturn?: boolean; log?: TRepositoryLogOptions };
  }): Promise<TCount & { data: TNullable<Array<R>> }> {
    const options = {
      shouldReturn: true,
      ...opts.options,
    } as ExtraOptions & { shouldReturn: boolean };
    return this._create<R>({ data: opts.data, options });
  }

  // ---------------------------------------------------------------------------
  protected async _update<R = EntitySchema['$inferSelect']>(opts: {
    data: Partial<PersistObject>;
    where: TWhere<DataObject>;
    options?: ExtraOptions & {
      shouldReturn?: boolean;
      force?: boolean;
      log?: TRepositoryLogOptions;
    };
  }): Promise<TCount & { data: TNullable<Array<R>> }> {
    const { shouldReturn = true, force = false, log, transaction } = opts?.options ?? {};

    if (log?.use) {
      this.logger.log(log.level ?? 'info', '[_update] Executing with opts: %j', opts);
    }

    // Early validation BEFORE conversion (Phase 2.1 fix)
    const isEmptyInputWhere = !opts.where || isEmpty(opts.where);
    if (!force && isEmptyInputWhere) {
      throw getError({
        message: `[_update] Entity: ${this.entity.name} | DENY to perform update | Empty where condition`,
      });
    }

    const where = this.filterBuilder.toWhere({
      tableName: this.entity.name,
      schema: this.entity.schema,
      where: opts.where,
    });

    if (isEmptyInputWhere) {
      this.logger.warn(
        '[_update] Entity: %s | Performing update with empty condition | data: %j',
        this.entity.name,
        opts.data,
      );
    }

    const connector = this.resolveConnector(transaction);
    const query = connector.update(this.entity.schema).set(opts.data).where(where);

    if (!shouldReturn) {
      const rs = await query;
      this.logger.debug('[_update] UPDATE result | shouldReturn: %s | rs: %j', shouldReturn, rs);
      return { count: rs?.rowCount ?? 0, data: null };
    }

    const rs = (await query.returning()) as unknown as Array<R>;
    this.logger.debug('[_update] UPDATE result | shouldReturn: %s | rs: %j', shouldReturn, rs);
    return { count: rs.length, data: rs };
  }

  // ---------------------------------------------------------------------------
  override updateById(opts: {
    id: IdType;
    data: Partial<PersistObject>;
    options: ExtraOptions & { shouldReturn: false; log?: TRepositoryLogOptions };
  }): Promise<TCount & { data: null }>;
  override updateById<R = EntitySchema['$inferSelect']>(opts: {
    id: IdType;
    data: Partial<PersistObject>;
    options?: ExtraOptions & { shouldReturn?: true; log?: TRepositoryLogOptions };
  }): Promise<TCount & { data: R }>;
  override async updateById<R = EntitySchema['$inferSelect']>(opts: {
    id: IdType;
    data: Partial<PersistObject>;
    options?: ExtraOptions & { shouldReturn?: boolean; log?: TRepositoryLogOptions };
  }): Promise<TCount & { data: TNullable<R> }> {
    const rs = await this._update<R>({
      where: { id: opts.id } as any,
      data: opts.data,
      options: opts.options,
    });
    return { count: rs.count, data: rs.data?.[0] ?? null };
  }

  // ---------------------------------------------------------------------------
  override updateAll(opts: {
    data: Partial<PersistObject>;
    where: TWhere<DataObject>;
    options: ExtraOptions & {
      shouldReturn: false;
      force?: boolean;
      log?: TRepositoryLogOptions;
    };
  }): Promise<TCount & { data: null }>;
  override updateAll<R = EntitySchema['$inferSelect']>(opts: {
    data: Partial<PersistObject>;
    where: TWhere<DataObject>;
    options?: ExtraOptions & {
      shouldReturn?: true;
      force?: boolean;
      log?: TRepositoryLogOptions;
    };
  }): Promise<TCount & { data: Array<R> }>;
  override updateAll<R = EntitySchema['$inferSelect']>(opts: {
    data: Partial<PersistObject>;
    where: TWhere<DataObject>;
    options?: ExtraOptions & {
      shouldReturn?: boolean;
      force?: boolean;
      log?: TRepositoryLogOptions;
    };
  }): Promise<TCount & { data: TNullable<Array<R>> }> {
    return this._update<R>(opts);
  }

  // ---------------------------------------------------------------------------
  protected async _delete<R = EntitySchema['$inferSelect']>(opts: {
    where: TWhere<DataObject>;
    options?: ExtraOptions & {
      shouldReturn?: boolean;
      force?: boolean;
      log?: TRepositoryLogOptions;
    };
  }): Promise<TCount & { data: TNullable<Array<R>> }> {
    const { shouldReturn = true, force = false, log, transaction } = opts?.options ?? {};

    if (log?.use) {
      this.logger.log(log.level ?? 'info', '[_delete] Executing with opts: %j', opts);
    }

    // Early validation BEFORE conversion (Phase 2.1 fix)
    const isEmptyInputWhere = !opts.where || isEmpty(opts.where);
    if (!force && isEmptyInputWhere) {
      throw getError({
        message: `[_delete] Entity: ${this.entity.name} | DENY to perform delete | Empty where condition`,
      });
    }

    const where = this.filterBuilder.toWhere({
      tableName: this.entity.name,
      schema: this.entity.schema,
      where: opts.where,
    });

    if (isEmptyInputWhere) {
      this.logger.warn(
        '[_delete] Entity: %s | Performing delete with empty condition',
        this.entity.name,
      );
    }

    const connector = this.resolveConnector(transaction);
    const query = connector.delete(this.entity.schema).where(where);

    if (!shouldReturn) {
      const rs = await query;
      this.logger.debug('[_delete] DELETE result | shouldReturn: %s | rs: %j', shouldReturn, rs);
      return { count: rs?.rowCount ?? 0, data: null };
    }

    const rs = (await query.returning()) as unknown as Array<R>;
    this.logger.debug('[_delete] DELETE result | shouldReturn: %s | rs: %j', shouldReturn, rs);
    return { count: rs.length, data: rs };
  }

  override deleteById(opts: {
    id: IdType;
    options: ExtraOptions & { shouldReturn: false; log?: TRepositoryLogOptions };
  }): Promise<TCount & { data: null }>;
  override deleteById<R = EntitySchema['$inferSelect']>(opts: {
    id: IdType;
    options?: ExtraOptions & { shouldReturn?: true; log?: TRepositoryLogOptions };
  }): Promise<TCount & { data: R }>;
  override async deleteById<R = EntitySchema['$inferSelect']>(opts: {
    id: IdType;
    options?: ExtraOptions & { shouldReturn?: boolean; log?: TRepositoryLogOptions };
  }): Promise<TCount & { data: TNullable<R> }> {
    const rs = await this._delete<R>({
      where: { id: opts.id } as any,
      options: opts.options,
    });
    return { count: rs.count, data: rs.data?.[0] ?? null };
  }

  override deleteAll(opts: {
    where?: TWhere<DataObject>;
    options: ExtraOptions & {
      shouldReturn: false;
      force?: boolean;
      log?: TRepositoryLogOptions;
    };
  }): Promise<TCount & { data: null }>;
  override deleteAll<R = EntitySchema['$inferSelect']>(opts: {
    where?: TWhere<DataObject>;
    options?: ExtraOptions & {
      shouldReturn?: true;
      force?: boolean;
      log?: TRepositoryLogOptions;
    };
  }): Promise<TCount & { data: Array<R> }>;
  override deleteAll<R = EntitySchema['$inferSelect']>(opts: {
    where?: TWhere<DataObject>;
    options?: ExtraOptions & {
      shouldReturn?: boolean;
      force?: boolean;
      log?: TRepositoryLogOptions;
    };
  }): Promise<TCount & { data: TNullable<Array<R>> }> {
    // Provide default empty where object if undefined
    return this._delete<R>({ where: opts.where ?? {}, options: opts.options });
  }

  override deleteBy(opts: {
    where: TWhere<DataObject>;
    options: ExtraOptions & {
      shouldReturn: false;
      force?: boolean;
      log?: TRepositoryLogOptions;
    };
  }): Promise<TCount & { data: null }>;
  override deleteBy<R = EntitySchema['$inferSelect']>(opts: {
    where: TWhere<DataObject>;
    options?: ExtraOptions & {
      shouldReturn?: true;
      force?: boolean;
      log?: TRepositoryLogOptions;
    };
  }): Promise<TCount & { data: Array<R> }>;
  override deleteBy<R = EntitySchema['$inferSelect']>(opts: {
    where: TWhere<DataObject>;
    options?: ExtraOptions & {
      shouldReturn?: boolean;
      force?: boolean;
      log?: TRepositoryLogOptions;
    };
  }): Promise<TCount & { data: TNullable<Array<R>> }> {
    if (opts.options?.shouldReturn === false) {
      const strictOpts = opts as {
        where: TWhere<DataObject>;
        options: ExtraOptions & {
          shouldReturn: false;
          force?: boolean;
          log?: TRepositoryLogOptions;
        };
      };
      return this.deleteAll(strictOpts);
    }

    const strictOpts = opts as {
      where: TWhere<DataObject>;
      options?: ExtraOptions & {
        shouldReturn?: true;
        force?: boolean;
        log?: TRepositoryLogOptions;
      };
    };
    return this.deleteAll<R>(strictOpts);
  }
}
