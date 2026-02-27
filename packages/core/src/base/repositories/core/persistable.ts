import { IDataSource } from '@/base/datasources';
import { BaseEntity, IdType, TTableInsert, TTableObject, TTableSchemaWithId } from '@/base/models';
import { getError, TClass, TNullable } from '@venizia/ignis-helpers';
import isEmpty from 'lodash/isEmpty';
import {
  IExtraOptions,
  RepositoryOperationScopes,
  TCount,
  TRepositoryLogOptions,
  TWhere,
} from '../common';
import { UpdateBuilder } from '../operators/update';
import { ReadableRepository } from './readable';

/** Full CRUD repository extending ReadableRepository with create, update, and delete. */
export class PersistableRepository<
  EntitySchema extends TTableSchemaWithId = TTableSchemaWithId,
  DataObject extends TTableObject<EntitySchema> = TTableObject<EntitySchema>,
  PersistObject extends TTableInsert<EntitySchema> = TTableInsert<EntitySchema>,
  ExtraOptions extends IExtraOptions = IExtraOptions,
> extends ReadableRepository<EntitySchema, DataObject, PersistObject, ExtraOptions> {
  protected _updateBuilder: UpdateBuilder;

  constructor(ds?: IDataSource, opts?: { entityClass?: TClass<BaseEntity<EntitySchema>> }) {
    super(ds, { entityClass: opts?.entityClass });
    this._operationScope = RepositoryOperationScopes.READ_WRITE;
    this._updateBuilder = new UpdateBuilder();
  }
  get updateBuilder() {
    return this._updateBuilder;
  }
  /** Prevents accidental mass updates/deletes by requiring explicit force flag for empty where. */
  protected validateWhereCondition(opts: {
    where: TWhere<DataObject>;
    force?: boolean;
    operationName: string;
  }): boolean {
    const isEmptyWhere = !opts.where || isEmpty(opts.where);

    if (!opts.force && isEmptyWhere) {
      throw getError({
        message: `[${opts.operationName}] Entity: ${this.entity.name} | DENY to perform ${opts.operationName.replace('_', '')} | Empty where condition`,
      });
    }

    return isEmptyWhere;
  }
  protected async _create<R = DataObject>(opts: {
    data: Array<PersistObject>;
    options: ExtraOptions & { shouldReturn?: boolean; log?: TRepositoryLogOptions };
  }): Promise<TCount & { data: TNullable<Array<R>> }> {
    const { shouldReturn = true, log, transaction } = opts.options ?? {};

    if (log?.use) {
      this.logger.for('_create').log(log.level ?? 'info', 'Executing with opts: %j', opts);
    }

    const connector = this.resolveConnector({ transaction });
    const query = connector.insert(this.entity.schema).values(opts.data);

    if (!shouldReturn) {
      const rs = await query;
      this.logger
        .for('_create')
        .debug('INSERT result | shouldReturn: %s | rs: %j', shouldReturn, rs);
      return { count: rs.rowCount ?? 0, data: null };
    }

    const visibleProps = this.getVisibleProperties();
    const rs = visibleProps ? await query.returning(visibleProps) : await query.returning();
    this.logger.for('_create').debug('INSERT result | shouldReturn: %s | rs: %j', shouldReturn, rs);
    return { count: rs.length, data: rs as Array<R> };
  }

  override create(opts: {
    data: PersistObject;
    options: ExtraOptions & { shouldReturn: false };
  }): Promise<TCount & { data: undefined | null }>;
  override create<R = DataObject>(opts: {
    data: PersistObject;
    options?: ExtraOptions & { shouldReturn?: true };
  }): Promise<TCount & { data: R }>;
  override async create<R = DataObject>(opts: {
    data: PersistObject;
    options?: ExtraOptions & { shouldReturn?: boolean };
  }): Promise<TCount & { data: TNullable<R> }> {
    const options = { shouldReturn: true, ...opts.options } as ExtraOptions & {
      shouldReturn: boolean;
    };
    const rs = await this._create<R>({ data: [opts.data], options });
    return { count: rs.count, data: rs.data?.[0] ?? null };
  }

  override createAll(opts: {
    data: Array<PersistObject>;
    options: ExtraOptions & { shouldReturn: false };
  }): Promise<TCount & { data: undefined | null }>;
  override createAll<R = DataObject>(opts: {
    data: Array<PersistObject>;
    options?: ExtraOptions & { shouldReturn?: true };
  }): Promise<TCount & { data: Array<R> }>;
  override createAll<R = DataObject>(opts: {
    data: Array<PersistObject>;
    options?: ExtraOptions & { shouldReturn?: boolean };
  }): Promise<TCount & { data: TNullable<Array<R>> }> {
    const options = { shouldReturn: true, ...opts.options } as ExtraOptions & {
      shouldReturn: boolean;
    };
    return this._create<R>({ data: opts.data, options });
  }
  protected async _update<R = DataObject>(opts: {
    data: Partial<PersistObject>;
    where: TWhere<DataObject>;
    options?: ExtraOptions & {
      shouldReturn?: boolean;
      force?: boolean;
    };
  }): Promise<TCount & { data: TNullable<Array<R>> }> {
    const {
      shouldReturn = true,
      force = false,
      log,
      transaction,
      shouldSkipDefaultFilter,
    } = opts?.options ?? {};

    if (log?.use) {
      this.logger.for('_update').log(log.level ?? 'info', 'Executing with opts: %j', opts);
    }

    const mergedFilter = this.applyDefaultFilter({
      userFilter: { where: opts.where },
      shouldSkipDefaultFilter,
    });
    const mergedWhere = mergedFilter.where ?? opts.where;

    const isEmptyWhere = this.validateWhereCondition({
      where: mergedWhere,
      force,
      operationName: '_update',
    });

    const where = this.filterBuilder.toWhere({
      tableName: this.entity.name,
      schema: this.entity.schema,
      where: mergedWhere,
    });

    if (isEmptyWhere) {
      this.logger
        .for('_update')
        .warn(
          'Entity: %s | Performing update with empty condition | data: %j',
          this.entity.name,
          opts.data,
        );
    }

    const transformed = this._updateBuilder.transform({
      tableName: this.entity.name,
      schema: this.entity.schema,
      data: opts.data,
    });
    const updateData = this._updateBuilder.toUpdateData({ transformed });

    const connector = this.resolveConnector({ transaction });
    const query = connector.update(this.entity.schema).set(updateData).where(where);

    if (!shouldReturn) {
      const rs = await query;
      this.logger
        .for('_update')
        .debug('UPDATE result | shouldReturn: %s | rs: %j', shouldReturn, rs);
      return { count: rs?.rowCount ?? 0, data: null };
    }

    const visibleProps = this.getVisibleProperties();
    const rs = visibleProps
      ? ((await query.returning(visibleProps)) as Array<R>)
      : ((await query.returning()) as Array<R>);
    this.logger.for('_update').debug('UPDATE result | shouldReturn: %s | rs: %j', shouldReturn, rs);
    return { count: rs.length, data: rs };
  }

  override updateById(opts: {
    id: IdType;
    data: Partial<PersistObject>;
    options: ExtraOptions & { shouldReturn: false };
  }): Promise<TCount & { data: undefined | null }>;
  override updateById<R = DataObject>(opts: {
    id: IdType;
    data: Partial<PersistObject>;
    options?: ExtraOptions & { shouldReturn?: true };
  }): Promise<TCount & { data: R }>;
  override async updateById<R = DataObject>(opts: {
    id: IdType;
    data: Partial<PersistObject>;
    options?: ExtraOptions & { shouldReturn?: boolean };
  }): Promise<TCount & { data: TNullable<R> }> {
    const rs = await this._update<R>({
      where: { id: opts.id },
      data: opts.data,
      options: opts.options,
    });
    return { count: rs.count, data: rs.data?.[0] ?? null };
  }

  override updateAll(opts: {
    data: Partial<PersistObject>;
    where: TWhere<DataObject>;
    options: ExtraOptions & { shouldReturn: false; force?: boolean };
  }): Promise<TCount & { data: undefined | null }>;
  override updateAll<R = DataObject>(opts: {
    data: Partial<PersistObject>;
    where: TWhere<DataObject>;
    options?: ExtraOptions & { shouldReturn?: true; force?: boolean };
  }): Promise<TCount & { data: Array<R> }>;
  override updateAll<R = DataObject>(opts: {
    data: Partial<PersistObject>;
    where: TWhere<DataObject>;
    options?: ExtraOptions & { shouldReturn?: boolean; force?: boolean };
  }): Promise<TCount & { data: TNullable<Array<R>> }> {
    return this._update<R>(opts);
  }
  protected async _delete<R = DataObject>(opts: {
    where: TWhere<DataObject>;
    options?: ExtraOptions & { shouldReturn?: boolean; force?: boolean };
  }): Promise<TCount & { data: TNullable<Array<R>> }> {
    const {
      shouldReturn = true,
      force = false,
      log,
      transaction,
      shouldSkipDefaultFilter,
    } = opts?.options ?? {};

    if (log?.use) {
      this.logger.for('_delete').log(log.level ?? 'info', 'Executing with opts: %j', opts);
    }

    const mergedFilter = this.applyDefaultFilter({
      userFilter: { where: opts.where },
      shouldSkipDefaultFilter,
    });
    const mergedWhere = mergedFilter.where ?? opts.where;

    const isEmptyWhere = this.validateWhereCondition({
      where: mergedWhere,
      force,
      operationName: '_delete',
    });

    const where = this.filterBuilder.toWhere({
      tableName: this.entity.name,
      schema: this.entity.schema,
      where: mergedWhere,
    });

    if (isEmptyWhere) {
      this.logger
        .for('_delete')
        .warn('Entity: %s | Performing delete with empty condition', this.entity.name);
    }

    const connector = this.resolveConnector({ transaction });
    const query = connector.delete(this.entity.schema).where(where);

    if (!shouldReturn) {
      const rs = await query;
      this.logger
        .for('_delete')
        .debug('DELETE result | shouldReturn: %s | rs: %j', shouldReturn, rs);
      return { count: rs?.rowCount ?? 0, data: null };
    }

    const visibleProps = this.getVisibleProperties();
    const rs = visibleProps ? await query.returning(visibleProps) : await query.returning();
    this.logger.for('_delete').debug('DELETE result | shouldReturn: %s | rs: %j', shouldReturn, rs);
    return { count: rs.length, data: rs as Array<R> };
  }

  override deleteById(opts: {
    id: IdType;
    options: ExtraOptions & { shouldReturn: false };
  }): Promise<TCount & { data: undefined | null }>;
  override deleteById<R = DataObject>(opts: {
    id: IdType;
    options?: ExtraOptions & { shouldReturn?: true };
  }): Promise<TCount & { data: R }>;
  override async deleteById<R = DataObject>(opts: {
    id: IdType;
    options?: ExtraOptions & { shouldReturn?: boolean };
  }): Promise<TCount & { data: TNullable<R> }> {
    const rs = await this._delete<R>({
      where: { id: opts.id },
      options: opts.options,
    });
    return { count: rs.count, data: rs.data?.[0] ?? null };
  }

  override deleteAll(opts: {
    where?: TWhere<DataObject>;
    options: ExtraOptions & { shouldReturn: false; force?: boolean };
  }): Promise<TCount & { data: undefined | null }>;
  override deleteAll<R = DataObject>(opts: {
    where?: TWhere<DataObject>;
    options?: ExtraOptions & { shouldReturn?: true; force?: boolean };
  }): Promise<TCount & { data: Array<R> }>;
  override deleteAll<R = DataObject>(opts: {
    where?: TWhere<DataObject>;
    options?: ExtraOptions & { shouldReturn?: boolean; force?: boolean };
  }): Promise<TCount & { data: TNullable<Array<R>> }> {
    return this._delete<R>({ where: opts.where ?? {}, options: opts.options });
  }

  override deleteBy(opts: {
    where: TWhere<DataObject>;
    options: ExtraOptions & { shouldReturn: false; force?: boolean };
  }): Promise<TCount & { data: undefined | null }>;
  override deleteBy<R = DataObject>(opts: {
    where: TWhere<DataObject>;
    options?: ExtraOptions & { shouldReturn?: true; force?: boolean };
  }): Promise<TCount & { data: Array<R> }>;
  override deleteBy<R = DataObject>(opts: {
    where: TWhere<DataObject>;
    options?: ExtraOptions & { shouldReturn?: boolean; force?: boolean };
  }): Promise<TCount & { data: TNullable<Array<R>> }> {
    if (opts.options?.shouldReturn === false) {
      const strictOpts = opts as {
        where: TWhere<DataObject>;
        options: ExtraOptions & { shouldReturn: false; force?: boolean };
      };
      return this.deleteAll(strictOpts);
    }

    const strictOpts = opts as {
      where: TWhere<DataObject>;
      options?: ExtraOptions & { shouldReturn?: true; force?: boolean };
    };
    return this.deleteAll<R>(strictOpts);
  }
}
