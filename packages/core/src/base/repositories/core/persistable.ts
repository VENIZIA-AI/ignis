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

// -----------------------------------------------------------------------------
// Persistable Repository
// -----------------------------------------------------------------------------

/**
 * Full CRUD repository implementation.
 *
 * Extends {@link ReadableRepository} with create, update, and delete operations.
 * This class provides the complete set of database operations for entities.
 *
 * @template EntitySchema - The Drizzle table schema type with an 'id' column
 * @template DataObject - The type of objects returned from queries
 * @template PersistObject - The type for insert/update operations
 * @template ExtraOptions - Additional options type extending IExtraOptions
 *
 * @example
 * ```typescript
 * @repository({ model: User, dataSource: PostgresDataSource })
 * export class UserRepository extends PersistableRepository<typeof User.schema> {
 *   async createWithDefaults(email: string) {
 *     return this.create({
 *       data: { email, role: 'user', isActive: true }
 *     });
 *   }
 * }
 * ```
 */
export class PersistableRepository<
  EntitySchema extends TTableSchemaWithId = TTableSchemaWithId,
  DataObject extends TTableObject<EntitySchema> = TTableObject<EntitySchema>,
  PersistObject extends TTableInsert<EntitySchema> = TTableInsert<EntitySchema>,
  ExtraOptions extends IExtraOptions = IExtraOptions,
> extends ReadableRepository<EntitySchema, DataObject, PersistObject, ExtraOptions> {
  // ---------------------------------------------------------------------------
  // Properties
  // ---------------------------------------------------------------------------

  /** Builder for transforming update data with JSON path support. */
  protected _updateBuilder: UpdateBuilder;

  // ---------------------------------------------------------------------------
  // Constructor
  // ---------------------------------------------------------------------------

  /**
   * Creates a new persistable (read-write) repository instance.
   *
   * @param ds - Optional data source (auto-injected from @repository decorator)
   * @param opts - Optional configuration
   * @param opts.entityClass - Entity class if not using @repository decorator
   */
  constructor(ds?: IDataSource, opts?: { entityClass?: TClass<BaseEntity<EntitySchema>> }) {
    super(ds, { entityClass: opts?.entityClass });
    this._operationScope = RepositoryOperationScopes.READ_WRITE;
    this._updateBuilder = new UpdateBuilder();
  }

  // ---------------------------------------------------------------------------
  // Accessors
  // ---------------------------------------------------------------------------

  /** Returns the update builder instance. */
  get updateBuilder() {
    return this._updateBuilder;
  }

  // ---------------------------------------------------------------------------
  // Protected Helpers
  // ---------------------------------------------------------------------------

  /**
   * Validates where condition for bulk operations (update/delete).
   * Prevents accidental mass updates/deletes by requiring explicit force flag.
   *
   * @param opts - Validation options
   * @param opts.where - The where condition to validate
   * @param opts.force - If true, allows empty where condition
   * @param opts.operationName - Operation name for error message
   * @returns True if where is empty (used for logging warnings)
   * @throws Error if where is empty and force is not true
   */
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

  // ---------------------------------------------------------------------------
  // Create Operations
  // ---------------------------------------------------------------------------

  /**
   * Internal create implementation for single or bulk inserts.
   *
   * @template R - Return type (defaults to DataObject)
   * @param opts - Create options
   * @param opts.data - Array of records to insert
   * @param opts.options - Extra options (transaction, logging, shouldReturn)
   * @returns Promise with count and optionally the created records
   */
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

    // Return only visible properties (excludes hidden properties at SQL level)
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

  // ---------------------------------------------------------------------------
  // Update Operations
  // ---------------------------------------------------------------------------

  /**
   * Internal update implementation for single or bulk updates.
   *
   * @template R - Return type (defaults to DataObject)
   * @param opts - Update options
   * @param opts.data - Partial data to update
   * @param opts.where - Where condition for selecting records to update
   * @param opts.options - Extra options (transaction, logging, shouldReturn, force)
   * @returns Promise with count and optionally the updated records
   */
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

    // Apply default filter's where condition
    const mergedFilter = this.applyDefaultFilter({
      userFilter: { where: opts.where },
      shouldSkipDefaultFilter,
    });
    const mergedWhere = mergedFilter.where ?? opts.where;

    // Validate where condition (throws if empty without force)
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

    // Transform data to handle JSON path updates (e.g., 'metadata.settings.theme': 'dark')
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

    // Return only visible properties (excludes hidden properties at SQL level)
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

  // ---------------------------------------------------------------------------
  // Delete Operations
  // ---------------------------------------------------------------------------

  /**
   * Internal delete implementation for single or bulk deletes.
   *
   * @template R - Return type (defaults to DataObject)
   * @param opts - Delete options
   * @param opts.where - Where condition for selecting records to delete
   * @param opts.options - Extra options (transaction, logging, shouldReturn, force)
   * @returns Promise with count and optionally the deleted records
   */
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

    // Apply default filter's where condition
    const mergedFilter = this.applyDefaultFilter({
      userFilter: { where: opts.where },
      shouldSkipDefaultFilter,
    });
    const mergedWhere = mergedFilter.where ?? opts.where;

    // Validate where condition (throws if empty without force)
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

    // Return only visible properties (excludes hidden properties at SQL level)
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
    // Provide default empty where object if undefined
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
