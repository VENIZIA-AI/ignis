import type { IRelationalDataSource } from '@/relational/core/datasources/common';
import type {
  BaseRelationalEntity,
  IUniqueKey,
  TTableInsert,
  TTableObject,
  TTableSchemaWithId,
} from '@/relational/core/models';
import type { AnyType, TClass, TNullable } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';
import type { IExtraOptions, TCount, TRepositoryLogOptions, TWhere } from '@venizia/ignis-kernel';
import { RepositoryOperationScopes, ScopeOperations } from '@venizia/ignis-kernel';
import type { SQL } from 'drizzle-orm';
import type {
  IRelationalExtraOptions,
  TRelationalTransactionOf,
  TUpsertUpdateKey,
} from '../common';
import { ScopeWriteGuard } from '../common/scope-write-guard';
import { UpsertPlan } from '../common/upsert-plan';
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

  /** Runs before every public update and upsert, with the `data` it was given; throw to refuse the call. Accepts everything by default. */
  protected validateUpdateData(_opts: { data: object }): void {}

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

    // A `through` model checks its parents and writes in one transaction, so the lock on the checked parents lasts until the write.
    if (this.getAccessSettings()?.through && !transaction) {
      return this.runInTransaction({
        execute: (owned) =>
          this._create<R>({ ...opts, options: Object.assign({}, opts.options, owned) }),
      });
    }

    if (log?.use) {
      this.logger.for('_create').log(log.level ?? 'info', 'Executing with opts: %j', opts);
    }

    const scoped = await this.guardScopedWrite({
      rows: opts.data as Array<Record<string, unknown>>,
      operation: ScopeOperations.CREATE,
      transaction,
    });
    const values = scoped as Array<PersistObject>;

    const connector = await this.acquireConnector({ transaction });

    const rs = await this.queryExecutor.insert<R>({
      connector,
      table: this.entity.schema,
      values,
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

  /**
   * Inserts one row; `shouldReturn: false` skips reading it back.
   * @example
   * ```typescript
   * import { DefaultCRUDRepository } from '@venizia/ignis-connectors/postgres';
   * import { pgTable, serial, text } from 'drizzle-orm/pg-core';
   *
   * const users = pgTable('User', { id: serial('id').primaryKey(), status: text('status') });
   * declare const repo: DefaultCRUDRepository<typeof users>;
   * const { data } = await repo.create({ data: { status: 'ACTIVE' } });
   * await repo.create({ data: { status: 'ACTIVE' }, options: { shouldReturn: false } });
   * ```
   */
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

  /**
   * Inserts many rows in one statement.
   * @example
   * ```typescript
   * import { DefaultCRUDRepository } from '@venizia/ignis-connectors/postgres';
   * import { pgTable, serial, text } from 'drizzle-orm/pg-core';
   *
   * const users = pgTable('User', { id: serial('id').primaryKey(), status: text('status') });
   * declare const repo: DefaultCRUDRepository<typeof users>;
   * const { count } = await repo.createAll({ data: [{ status: 'ACTIVE' }, { status: 'DONE' }] });
   * ```
   */
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

  /**
   * One `INSERT ... ON CONFLICT (key) DO UPDATE` statement. The key and `update` are checked before anything else, so a
   * bad one runs no guard and no SQL. The new row passes the CREATE guard; the columns the update branch writes pass the
   * UPDATE guard; the existing row must match the UPDATE scope and the default filter (`setWhere`), read in the same
   * statement, so it cannot change between the check and the write.
   */
  protected async _upsert<R = DataObject>(opts: {
    data: PersistObject;
    on?: IUniqueKey<EntitySchema>;
    update?: ReadonlyArray<string>;
    options?: ExtraOptions & { shouldReturn?: boolean; log?: TRepositoryLogOptions };
  }): Promise<TCount & { data: TNullable<R> }> {
    const { shouldReturn = true, log, transaction } = opts.options ?? {};
    const data: Record<string, unknown> = opts.data;
    const plan = UpsertPlan.build({
      schema: this.entity.schema,
      data,
      on: opts.on,
      update: opts.update,
    });

    // As in `_create`: a `through` model checks its parents and writes in one transaction.
    if (this.getAccessSettings()?.through && !transaction) {
      return this.runInTransaction({
        execute: (owned) =>
          this._upsert<R>({ ...opts, options: Object.assign({}, opts.options, owned) }),
      });
    }

    if (log?.use) {
      this.logger.for('_upsert').log(log.level ?? 'info', 'Executing with opts: %j', opts);
    }

    // A null the caller sent is refused before the guard runs; an absent column is read after it, as `assign` may fill it.
    UpsertPlan.assertKeyValues({
      schema: this.entity.schema,
      key: plan.key,
      row: data,
      isAbsentAllowed: true,
    });

    const [row] = await this.guardScopedWrite({
      rows: [data],
      operation: ScopeOperations.CREATE,
      transaction,
    });

    UpsertPlan.assertKeyValues({
      schema: this.entity.schema,
      key: plan.key,
      row,
      isAbsentAllowed: false,
    });

    await this.guardScopedWrite({
      rows: [Object.fromEntries(plan.updateKeys.map((property) => [property, row[property]]))],
      operation: ScopeOperations.UPDATE,
      transaction,
    });

    // `shouldSkipDefaultFilter` is not read: an upsert never updates a row the default filter hides (a soft deleted one).
    const mergedFilter = this.applyDefaultFilter({
      userFilter: { where: {} },
      mutation: ScopeOperations.UPDATE,
    });
    const setWhere = this.queryDialect.toWhere({
      tableName: this.entity.name,
      schema: this.entity.schema,
      where: mergedFilter.where ?? {},
    });

    const connector = await this.acquireConnector({ transaction });

    const rs = await this.queryExecutor.insert<R>({
      connector,
      table: this.entity.schema,
      values: row,
      returning: this.getVisibleProperties(),
      shouldReturn,
      onConflict: {
        target: plan.target,
        targetWhere: plan.key.where,
        set: plan.set,
        setWhere,
      },
    });

    this.logger.for('_upsert').debug('UPSERT result | shouldReturn: %s | rs: %j', shouldReturn, rs);

    // No row back means a row holds the key but `setWhere` kept it: it is outside the scope or the default filter. It is
    // not an insert (there was a conflict) and not a success (nothing was written).
    if (rs.count === 0) {
      throw ScopeWriteGuard.conflictDenied({ model: this.entity.name });
    }

    return { count: rs.count, data: shouldReturn ? (rs.rows[0] ?? null) : null };
  }

  /**
   * Inserts one row, or updates the row that already holds its key: one `INSERT ... ON CONFLICT (key) DO UPDATE`
   * statement, with no read before it.
   *
   * - `on` is a key declared with `UniqueKeys.of`; omitted, the primary key. Every column of the key must hold a value
   *   (a scope column `write.mode: 'assign'` fills counts); a null is refused with a 400 unless the key is
   *   `nullsNotDistinct`.
   * - `update` lists the columns the update branch writes, each one set in `data` and none of the key. Without it, every
   *   column `data` sets except the key, the primary key and the creation audit columns.
   * - The new row is held to the access scope as `create` holds it, the columns written on a conflict as `update` holds
   *   them, and the existing row must be one the caller may update: a row outside the scope or hidden by the default
   *   filter is left as it is and the call fails with the write-denied 403. `options.shouldSkipDefaultFilter` is ignored.
   * - Defaults apply on insert, `$onUpdate` columns (`modifiedAt`, `modifiedBy`) on a conflict, and hidden fields are
   *   written but not returned.
   * @example
   * ```typescript
   * import { UniqueKeys } from '@venizia/ignis-connectors/relational';
   * import { DefaultCRUDRepository } from '@venizia/ignis-connectors/postgres';
   * import { pgTable, serial, text, uniqueIndex } from 'drizzle-orm/pg-core';
   *
   * const settings = pgTable(
   *   'Setting',
   *   { id: serial('id').primaryKey(), key: text('key').notNull(), value: text('value') },
   *   (t) => [uniqueIndex('setting_key').on(t.key)],
   * );
   * const settingKey = UniqueKeys.of({ table: settings, index: 'setting_key' });
   * declare const repo: DefaultCRUDRepository<typeof settings>;
   * const { data } = await repo.upsert({ data: { key: 'theme', value: 'dark' }, on: settingKey });
   * ```
   */
  upsert(opts: {
    data: PersistObject;
    on?: IUniqueKey<EntitySchema>;
    update?: ReadonlyArray<TUpsertUpdateKey<PersistObject>>;
    options: ExtraOptions & { shouldReturn: false };
  }): Promise<TCount & { data: undefined | null }>;
  upsert<R = DataObject>(opts: {
    data: PersistObject;
    on?: IUniqueKey<EntitySchema>;
    update?: ReadonlyArray<TUpsertUpdateKey<PersistObject>>;
    options?: ExtraOptions & { shouldReturn?: true };
  }): Promise<TCount & { data: R }>;
  async upsert<R = DataObject>(opts: {
    data: PersistObject;
    on?: IUniqueKey<EntitySchema>;
    update?: ReadonlyArray<TUpsertUpdateKey<PersistObject>>;
    options?: ExtraOptions & { shouldReturn?: boolean };
  }): Promise<TCount & { data: TNullable<R> }> {
    this.validateUpdateData({ data: opts.data });

    return this._upsert<R>({
      data: opts.data,
      on: opts.on,
      update: opts.update,
      options: opts.options,
    });
  }

  /**
   * `operation` is what the row scope sees: UPDATE for an update (and a restore), DELETE for a
   * soft delete, which is a delete to the caller even though it is stored as an update.
   */
  protected async _update<R = DataObject>(opts: {
    data: Partial<PersistObject>;
    where: TWhere<DataObject>;
    options?: IExtraOptions & {
      shouldReturn?: boolean;
      force?: boolean;
    };
    operation?: typeof ScopeOperations.UPDATE | typeof ScopeOperations.DELETE;
  }): Promise<TCount & { data: TNullable<Array<R>> }> {
    const { operation = ScopeOperations.UPDATE } = opts;

    const {
      shouldReturn = true,
      force = false,
      log,
      transaction,
      shouldSkipDefaultFilter,
    } = opts?.options ?? {};

    if (this.getAccessSettings()?.through && !transaction) {
      return this.runInTransaction({
        execute: (owned) =>
          this._update<R>({ ...opts, options: Object.assign({}, opts.options, owned) }),
      });
    }

    if (log?.use) {
      this.logger.for('_update').log(log.level ?? 'info', 'Executing with opts: %j', opts);
    }

    await this.guardScopedWrite({
      rows: [opts.data as Record<string, unknown>],
      operation,
      transaction,
    });

    const mergedFilter = this.applyDefaultFilter({
      userFilter: { where: opts.where },
      shouldSkipDefaultFilter,
      mutation: operation,
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

    const connector = await this.acquireConnector({ transaction });

    const rs = await this.queryExecutor.update<R>({
      connector,
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

  /**
   * Updates the row with this `id`.
   * @example
   * ```typescript
   * import { DefaultCRUDRepository } from '@venizia/ignis-connectors/postgres';
   * import { pgTable, serial, text } from 'drizzle-orm/pg-core';
   *
   * const users = pgTable('User', { id: serial('id').primaryKey(), status: text('status') });
   * declare const repo: DefaultCRUDRepository<typeof users>;
   * const { data } = await repo.updateById({ id: 1, data: { status: 'DONE' } });
   * ```
   */
  override updateById(opts: {
    id: DataObject['id'];
    data: Partial<PersistObject>;
    options: ExtraOptions & { shouldReturn: false };
  }): Promise<TCount & { data: undefined | null }>;
  override updateById<R = DataObject>(opts: {
    id: DataObject['id'];
    data: Partial<PersistObject>;
    options?: ExtraOptions & { shouldReturn?: true };
  }): Promise<TCount & { data: R }>;
  override async updateById<R = DataObject>(opts: {
    id: DataObject['id'];
    data: Partial<PersistObject>;
    options?: ExtraOptions & { shouldReturn?: boolean };
  }): Promise<TCount & { data: TNullable<R> }> {
    this.validateUpdateData({ data: opts.data });
    this.validateId({ id: opts.id, operationName: 'updateById' });

    const rs = await this._update<R>({
      where: this.whereById({ id: opts.id }),
      data: opts.data,
      options: opts.options,
    });

    return { count: rs.count, data: rs.data?.[0] ?? null };
  }

  /**
   * Gives each row its own `data`: one update per row, all in one transaction. A row that matches nothing (missing, outside the scope, soft deleted) is `null` in `data` and adds 0 to `count`.
   * @example
   * ```typescript
   * import { DefaultCRUDRepository } from '@venizia/ignis-connectors/postgres';
   * import { pgTable, serial, text } from 'drizzle-orm/pg-core';
   *
   * const users = pgTable('User', { id: serial('id').primaryKey(), status: text('status') });
   * declare const repo: DefaultCRUDRepository<typeof users>;
   * const rows = [{ id: 1, data: { status: 'DONE' } }, { id: 2, data: { status: 'ACTIVE' } }];
   * await repo.updateEach({ rows, options: { shouldReturn: false } });
   * ```
   */
  async updateEach<R = DataObject>(opts: {
    rows: Array<{ id: DataObject['id']; data: Partial<PersistObject> }>;
    options?: ExtraOptions & {
      shouldReturn?: boolean;
      transaction?: TRelationalTransactionOf<TDataSource>;
    };
  }): Promise<TCount & { data: TNullable<Array<TNullable<R>>> }> {
    const { rows, options } = opts;
    const shouldReturn = options?.shouldReturn !== false;

    for (const row of rows) {
      this.validateUpdateData({ data: row.data });
    }

    if (rows.length === 0) {
      return { count: 0, data: shouldReturn ? [] : null };
    }

    return this.runInTransaction({
      transaction: options?.transaction,
      execute: async ({ transaction }) => {
        let count = 0;
        const data: Array<TNullable<R>> = [];

        for (const { id, data: values } of rows) {
          this.validateId({ id, operationName: 'updateEach' });

          const rs = await this._update<R>({
            where: this.whereById({ id }),
            data: values,
            options: { ...options, transaction },
          });

          count += rs.count;
          data.push(rs.data?.[0] ?? null);
        }

        return { count, data: shouldReturn ? data : null };
      },
    });
  }

  /**
   * Applies one `data` patch to every row matching `where`; an empty `where` needs `options.force`.
   * @example
   * ```typescript
   * import { DefaultCRUDRepository } from '@venizia/ignis-connectors/postgres';
   * import { pgTable, serial, text } from 'drizzle-orm/pg-core';
   *
   * const users = pgTable('User', { id: serial('id').primaryKey(), status: text('status') });
   * declare const repo: DefaultCRUDRepository<typeof users>;
   * await repo.updateAll({ where: { status: 'ACTIVE' }, data: { status: 'DONE' } });
   * await repo.updateAll({ where: {}, data: { status: 'DONE' }, options: { force: true } });
   * ```
   */
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
  override async updateAll<R = DataObject>(opts: {
    data: Partial<PersistObject>;
    where: TWhere<DataObject>;
    options?: ExtraOptions & { shouldReturn?: boolean; force?: boolean };
  }): Promise<TCount & { data: TNullable<Array<R>> }> {
    this.validateUpdateData({ data: opts.data });

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
      mutation: ScopeOperations.DELETE,
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

    const connector = await this.acquireConnector({ transaction });

    const rs = await this.queryExecutor.remove<R>({
      connector,
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

  /**
   * Deletes the row with this `id`.
   * @example
   * ```typescript
   * import { DefaultCRUDRepository } from '@venizia/ignis-connectors/postgres';
   * import { pgTable, serial, text } from 'drizzle-orm/pg-core';
   *
   * const users = pgTable('User', { id: serial('id').primaryKey(), status: text('status') });
   * declare const repo: DefaultCRUDRepository<typeof users>;
   * const { count } = await repo.deleteById({ id: 1 });
   * ```
   */
  override deleteById(opts: {
    id: DataObject['id'];
    options: ExtraOptions & { shouldReturn: false };
  }): Promise<TCount & { data: undefined | null }>;
  override deleteById<R = DataObject>(opts: {
    id: DataObject['id'];
    options?: ExtraOptions & { shouldReturn?: true };
  }): Promise<TCount & { data: R }>;
  override async deleteById<R = DataObject>(opts: {
    id: DataObject['id'];
    options?: ExtraOptions & { shouldReturn?: boolean };
  }): Promise<TCount & { data: TNullable<R> }> {
    this.validateId({ id: opts.id, operationName: 'deleteById' });

    const rs = await this._delete<R>({
      where: this.whereById({ id: opts.id }),
      options: opts.options,
    });

    return { count: rs.count, data: rs.data?.[0] ?? null };
  }

  /**
   * Deletes the rows matching `where`; without `where` it needs `options.force`.
   * @example
   * ```typescript
   * import { DefaultCRUDRepository } from '@venizia/ignis-connectors/postgres';
   * import { pgTable, serial, text } from 'drizzle-orm/pg-core';
   *
   * const users = pgTable('User', { id: serial('id').primaryKey(), status: text('status') });
   * declare const repo: DefaultCRUDRepository<typeof users>;
   * await repo.deleteAll({ where: { status: 'DONE' } });
   * await repo.deleteAll({ options: { force: true } });
   * ```
   */
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

  /**
   * Deletes the rows matching `where`.
   * @example
   * ```typescript
   * import { DefaultCRUDRepository } from '@venizia/ignis-connectors/postgres';
   * import { pgTable, serial, text } from 'drizzle-orm/pg-core';
   *
   * const users = pgTable('User', { id: serial('id').primaryKey(), status: text('status') });
   * declare const repo: DefaultCRUDRepository<typeof users>;
   * const { count } = await repo.deleteBy({ where: { status: 'DONE' } });
   * ```
   */
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
