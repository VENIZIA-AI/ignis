import { IDataSource } from '@/base/datasources';
import { BaseEntity, IdType, TTableInsert, TTableObject, TTableSchemaWithId } from '@/base/models';
import { getError, TClass, TNullable } from '@venizia/ignis-helpers';
import isEmpty from 'lodash/isEmpty';
import { TCount, TRepositoryLogOptions, TWhere } from '../common';
import { RepositoryOperationScopes } from '../common/constants';
import { ReadableRepository } from './readable';

/**
 * Persistable repository with full CRUD operations.
 */
export class PersistableRepository<
  EntitySchema extends TTableSchemaWithId = TTableSchemaWithId,
  DataObject extends TTableObject<EntitySchema> = TTableObject<EntitySchema>,
  PersistObject extends TTableInsert<EntitySchema> = TTableInsert<EntitySchema>,
  ExtraOptions extends TNullable<object> = undefined,
> extends ReadableRepository<EntitySchema, DataObject, PersistObject, ExtraOptions> {
  constructor(ds?: IDataSource, opts?: { entityClass?: TClass<BaseEntity<EntitySchema>> }) {
    super(ds, { entityClass: opts?.entityClass });
    this.operationScope = RepositoryOperationScopes.READ_WRITE;
  }

  protected async _create(opts: {
    data: Array<PersistObject>;
    options: (ExtraOptions | {}) & { shouldReturn?: boolean; log?: TRepositoryLogOptions };
  }): Promise<TCount & { data: TNullable<Array<EntitySchema['$inferSelect']>> }> {
    const { shouldReturn = true, log } = opts.options ?? {};

    if (log?.use) {
      this.logger.log(log.level ?? 'info', '[_create] Executing with opts: %j', opts);
    }

    const query = this.connector.insert(this.entity.schema).values(opts.data);

    if (!shouldReturn) {
      const rs = await query;
      this.logger.debug('[_create] INSERT result | shouldReturn: %s | rs: %j', shouldReturn, rs);
      return { count: rs.rowCount ?? 0, data: null };
    }

    const rs = await query.returning();
    this.logger.debug('[_create] INSERT result | shouldReturn: %s | rs: %j', shouldReturn, rs);
    return { count: rs.length, data: rs };
  }

  // ---------------------------------------------------------------------------
  override create(opts: {
    data: PersistObject;
    options: (ExtraOptions | {}) & { shouldReturn: false; log?: TRepositoryLogOptions };
  }): Promise<TCount & { data: null }>;
  override create(opts: {
    data: PersistObject;
    options?: (ExtraOptions | {}) & { shouldReturn?: true; log?: TRepositoryLogOptions };
  }): Promise<TCount & { data: EntitySchema['$inferSelect'] }>;
  override async create(opts: {
    data: PersistObject;
    options?: (ExtraOptions | {}) & { shouldReturn?: boolean; log?: TRepositoryLogOptions };
  }): Promise<TCount & { data: TNullable<EntitySchema['$inferSelect']> }> {
    const rs = await this._create({
      data: [opts.data],
      options: opts.options ?? { shouldReturn: true },
    });
    return { count: rs.count, data: rs.data?.[0] ?? null };
  }

  // --------------------------------0-------------------------------------------
  override createAll(opts: {
    data: Array<PersistObject>;
    options: (ExtraOptions | {}) & { shouldReturn: false; log?: TRepositoryLogOptions };
  }): Promise<TCount & { data: null }>;
  override createAll(opts: {
    data: Array<PersistObject>;
    options?: (ExtraOptions | {}) & { shouldReturn?: true; log?: TRepositoryLogOptions };
  }): Promise<TCount & { data: Array<EntitySchema['$inferSelect']> }>;
  override createAll(opts: {
    data: Array<PersistObject>;
    options?: (ExtraOptions | {}) & { shouldReturn?: boolean; log?: TRepositoryLogOptions };
  }): Promise<TCount & { data: TNullable<Array<EntitySchema['$inferSelect']>> }> {
    return this._create({ data: opts.data, options: opts.options ?? { shouldReturn: true } });
  }

  // ---------------------------------------------------------------------------
  protected async _update(opts: {
    data: Partial<PersistObject>;
    where: TWhere<DataObject>;
    options?: (ExtraOptions | {}) & {
      shouldReturn?: boolean;
      force?: boolean;
      log?: TRepositoryLogOptions;
    };
  }): Promise<TCount & { data: TNullable<Array<EntitySchema['$inferSelect']>> }> {
    const { shouldReturn = true, force = false, log } = opts?.options ?? {};

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

    const query = this.connector.update(this.entity.schema).set(opts.data).where(where);

    if (!shouldReturn) {
      const rs = await query;
      this.logger.debug('[_update] UPDATE result | shouldReturn: %s | rs: %j', shouldReturn, rs);
      return { count: rs?.rowCount ?? 0, data: null };
    }

    const rs = (await query.returning()) as Array<EntitySchema['$inferSelect']>;
    this.logger.debug('[_update] UPDATE result | shouldReturn: %s | rs: %j', shouldReturn, rs);
    return { count: rs.length, data: rs };
  }

  // ---------------------------------------------------------------------------
  override updateById(opts: {
    id: IdType;
    data: Partial<PersistObject>;
    options: (ExtraOptions | {}) & { shouldReturn: false; log?: TRepositoryLogOptions };
  }): Promise<TCount & { data: null }>;
  override updateById(opts: {
    id: IdType;
    data: Partial<PersistObject>;
    options?: (ExtraOptions | {}) & { shouldReturn?: true; log?: TRepositoryLogOptions };
  }): Promise<TCount & { data: EntitySchema['$inferSelect'] }>;
  override async updateById(opts: {
    id: IdType;
    data: Partial<PersistObject>;
    options?: (ExtraOptions | {}) & { shouldReturn?: boolean; log?: TRepositoryLogOptions };
  }): Promise<TCount & { data: TNullable<EntitySchema['$inferSelect']> }> {
    const rs = await this._update({
      where: { id: opts.id },
      data: opts.data,
      options: opts.options,
    });
    return { count: rs.count, data: rs.data?.[0] ?? null };
  }

  // ---------------------------------------------------------------------------
  override updateAll(opts: {
    data: Partial<PersistObject>;
    where: TWhere<DataObject>;
    options: (ExtraOptions | {}) & {
      shouldReturn: false;
      force?: boolean;
      log?: TRepositoryLogOptions;
    };
  }): Promise<TCount & { data: null }>;
  override updateAll(opts: {
    data: Partial<PersistObject>;
    where: TWhere<DataObject>;
    options?: (ExtraOptions | {}) & {
      shouldReturn?: true;
      force?: boolean;
      log?: TRepositoryLogOptions;
    };
  }): Promise<TCount & { data: Array<EntitySchema['$inferSelect']> }>;
  override updateAll(opts: {
    data: Partial<PersistObject>;
    where: TWhere<DataObject>;
    options?: (ExtraOptions | {}) & {
      shouldReturn?: boolean;
      force?: boolean;
      log?: TRepositoryLogOptions;
    };
  }): Promise<TCount & { data: TNullable<Array<EntitySchema['$inferSelect']>> }> {
    return this._update(opts);
  }

  // ---------------------------------------------------------------------------
  protected async _delete(opts: {
    where: TWhere<DataObject>;
    options?: (ExtraOptions | {}) & {
      shouldReturn?: boolean;
      force?: boolean;
      log?: TRepositoryLogOptions;
    };
  }): Promise<TCount & { data: TNullable<Array<EntitySchema['$inferSelect']>> }> {
    const { shouldReturn = true, force = false, log } = opts?.options ?? {};

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

    const query = this.connector.delete(this.entity.schema).where(where);

    if (!shouldReturn) {
      const rs = await query;
      this.logger.debug('[_delete] DELETE result | shouldReturn: %s | rs: %j', shouldReturn, rs);
      return { count: rs?.rowCount ?? 0, data: null };
    }

    const rs = await query.returning();
    this.logger.debug('[_delete] DELETE result | shouldReturn: %s | rs: %j', shouldReturn, rs);
    return { count: rs.length, data: rs };
  }

  override deleteById(opts: {
    id: IdType;
    options: (ExtraOptions | {}) & { shouldReturn: false; log?: TRepositoryLogOptions };
  }): Promise<TCount & { data: null }>;
  override deleteById(opts: {
    id: IdType;
    options?: (ExtraOptions | {}) & { shouldReturn?: true; log?: TRepositoryLogOptions };
  }): Promise<TCount & { data: EntitySchema['$inferSelect'] }>;
  override async deleteById(opts: {
    id: IdType;
    options?: (ExtraOptions | {}) & { shouldReturn?: boolean; log?: TRepositoryLogOptions };
  }): Promise<TCount & { data: TNullable<EntitySchema['$inferSelect']> }> {
    const rs = await this._delete({
      where: { id: opts.id },
      options: opts.options,
    });
    return { count: rs.count, data: rs.data?.[0] ?? null };
  }

  override deleteAll(opts: {
    where: TWhere<DataObject>;
    options: (ExtraOptions | {}) & {
      shouldReturn: false;
      force?: boolean;
      log?: TRepositoryLogOptions;
    };
  }): Promise<TCount & { data: null }>;
  override deleteAll(opts: {
    where: TWhere<DataObject>;
    options?: (ExtraOptions | {}) & {
      shouldReturn?: true;
      force?: boolean;
      log?: TRepositoryLogOptions;
    };
  }): Promise<TCount & { data: Array<EntitySchema['$inferSelect']> }>;
  override deleteAll(opts: {
    where: TWhere<DataObject>;
    options?: (ExtraOptions | {}) & {
      shouldReturn?: boolean;
      force?: boolean;
      log?: TRepositoryLogOptions;
    };
  }): Promise<TCount & { data: TNullable<Array<EntitySchema['$inferSelect']>> }> {
    return this._delete(opts);
  }
}
