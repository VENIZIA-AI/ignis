import type { IdType } from '@venizia/ignis-kernel';
import type { IExtraOptions, TCount, TRepositoryLogOptions, TWhere } from '@venizia/ignis-kernel';
import { RepositoryOperationScopes } from '@venizia/ignis-kernel';
import type { IRelationalDataSource } from '@/relational/core/datasources/common';
import type {
  BaseRelationalEntity,
  TTableInsert,
  TTableObject,
  TTableSchemaWithId,
} from '@/relational/core/models';
import type { AnyType, TClass, TNullable } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';
import type { SQL } from 'drizzle-orm';
import type { IRelationalExtraOptions } from '../common';
import { ReadableRelationalRepository } from './readable';

/** Full CRUD repository extending ReadableRelationalRepository with create, update, and delete. */
export class PersistableRelationalRepository<
  EntitySchema extends TTableSchemaWithId = TTableSchemaWithId,
  DataObject extends TTableObject<EntitySchema> = TTableObject<EntitySchema>,
  PersistObject extends TTableInsert<EntitySchema> = TTableInsert<EntitySchema>,
  ExtraOptions extends IExtraOptions = IRelationalExtraOptions,
  TDataSource extends IRelationalDataSource = IRelationalDataSource,
> extends ReadableRelationalRepository<
  EntitySchema,
  DataObject,
  PersistObject,
  ExtraOptions,
  TDataSource
> {
  constructor(
    ds?: TDataSource,
    opts?: { entityClass?: TClass<BaseRelationalEntity<EntitySchema>> },
  ) {
    super(ds, { entityClass: opts?.entityClass });
    this._operationScope = RepositoryOperationScopes.READ_WRITE;
  }

  /** Reach the engine's update transform through `dataSource.getQueryDialect()`. Engines without an update builder return `undefined`. `AnyType` rather than `unknown`: the concrete builder is engine-specific, and `unknown` breaks every `updateBuilder.transform(...)` call site. */
  get updateBuilder(): AnyType {
    return (this.queryDialect as { updateBuilder?: AnyType }).updateBuilder;
  }

  /** Guards id-based operations against a null/undefined id */
  protected validateId(opts: { id: unknown; operationName: string }): void {
    if (opts.id !== null && opts.id !== undefined) {
      return;
    }

    throw getError({
      message: `[${opts.operationName}] DENY to perform | entity: ${this.entity.name} | id is null or undefined`,
    });
  }

  /** Prevents accidental table-wide updates/deletes by requiring an explicit force flag; returns the built where SQL so callers reuse it instead of rebuilding on identical input. */
  protected validateWhereCondition(opts: {
    where: TWhere<DataObject>;
    force?: boolean;
    operationName: string;
  }): { condition: SQL | undefined; isEmptyWhere: boolean } {
    const condition = this.queryDialect.toWhere({
      tableName: this.entity.name,
      schema: this.entity.schema,
      where: opts.where ?? {},
    });
    const isEmptyWhere = condition === undefined;

    if (!opts.force && isEmptyWhere) {
      throw getError({
        message: `[${opts.operationName}] Entity: ${this.entity.name} | DENY to perform ${opts.operationName.replace('_', '')} | Empty where condition`,
      });
    }

    return { condition, isEmptyWhere };
  }

  protected async _create<R = DataObject>(opts: {
    data: Array<PersistObject>;
    options: ExtraOptions & { shouldReturn?: boolean; log?: TRepositoryLogOptions };
  }): Promise<TCount & { data: TNullable<Array<R>> }> {
    const { shouldReturn = true, log, transaction } = opts.options ?? {};

    if (log?.use) {
      this.logger.for('_create').log(log.level ?? 'info', 'Executing with opts: %j', opts);
    }

    const rs = await this.queryExecutor.insert<R>({
      connector: this.resolveConnector({ transaction }),
      table: this.entity.schema,
      values: opts.data,
      returning: this.getVisibleProperties(),
      shouldReturn,
    });

    if (!shouldReturn) {
      this.logger
        .for('_create')
        .debug('INSERT result | shouldReturn: %s | rs: %j', shouldReturn, rs);
      return { count: rs.count, data: null };
    }

    this.logger.for('_create').debug('INSERT result | shouldReturn: %s | rs: %j', shouldReturn, rs);
    return { count: rs.count, data: rs.rows };
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
    // ExtraOptions is caller-bound and otherwise unconstrained, so the spread cannot be proven to satisfy the generic bound, only the concrete shape below.
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
    // ExtraOptions is caller-bound and otherwise unconstrained, so the spread cannot be proven to satisfy the generic bound, only the concrete shape below.
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

    const { condition: where, isEmptyWhere } = this.validateWhereCondition({
      where: mergedWhere,
      force,
      operationName: '_update',
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

    // JSON-path update composition is engine-specific (Postgres composes `jsonb_set`), so it goes through the dialect port rather than the executor.
    const transformed = this.queryDialect.transformUpdate({
      tableName: this.entity.name,
      schema: this.entity.schema,
      data: opts.data,
    });
    const updateData = this.queryDialect.toUpdateData({ transformed });

    const rs = await this.queryExecutor.update<R>({
      connector: this.resolveConnector({ transaction }),
      table: this.entity.schema,
      data: updateData,
      where,
      returning: this.getVisibleProperties(),
      shouldReturn,
    });

    if (!shouldReturn) {
      this.logger
        .for('_update')
        .debug('UPDATE result | shouldReturn: %s | rs: %j', shouldReturn, rs);
      return { count: rs.count, data: null };
    }

    this.logger.for('_update').debug('UPDATE result | shouldReturn: %s | rs: %j', shouldReturn, rs);
    return { count: rs.count, data: rs.rows };
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
    this.validateId({ id: opts.id, operationName: 'updateById' });

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

    const { condition: where, isEmptyWhere } = this.validateWhereCondition({
      where: mergedWhere,
      force,
      operationName: '_delete',
    });

    if (isEmptyWhere) {
      this.logger
        .for('_delete')
        .warn('Entity: %s | Performing delete with empty condition', this.entity.name);
    }

    const rs = await this.queryExecutor.remove<R>({
      connector: this.resolveConnector({ transaction }),
      table: this.entity.schema,
      where,
      returning: this.getVisibleProperties(),
      shouldReturn,
    });

    if (!shouldReturn) {
      this.logger
        .for('_delete')
        .debug('DELETE result | shouldReturn: %s | rs: %j', shouldReturn, rs);
      return { count: rs.count, data: null };
    }

    this.logger.for('_delete').debug('DELETE result | shouldReturn: %s | rs: %j', shouldReturn, rs);
    return { count: rs.count, data: rs.rows };
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
    this.validateId({ id: opts.id, operationName: 'deleteById' });

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
    const { where, options } = opts;

    if (options?.shouldReturn === false) {
      return this.deleteAll({ where, options: { ...options, shouldReturn: false } });
    }

    return this.deleteAll<R>({ where, options });
  }
}
