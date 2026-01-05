import { IDataSource, ITransaction, ITransactionOptions, TAnyConnector } from '@/base/datasources';
import { BaseEntity, IdType, TTableInsert, TTableObject, TTableSchemaWithId } from '@/base/models';
import { MetadataRegistry } from '@/helpers/inversion';
import { BaseHelper, getError, resolveValue, TClass, TNullable } from '@venizia/ignis-helpers';
import {
  IExtraOptions,
  IPersistableRepository,
  RepositoryOperationScopes,
  TCount,
  TDrizzleQueryOptions,
  TFilter,
  TRepositoryLogOptions,
  TRepositoryOperationScope,
  TWhere,
} from '../common';
import { DefaultFilterMixin, FieldsVisibilityMixin } from '../mixins';
import { FilterBuilder } from '../operators';

// -----------------------------------------------------------------------------
// Abstract Repository
// -----------------------------------------------------------------------------

/**
 * Abstract base repository class with dependency injection support.
 *
 * This class provides the foundation for all repository implementations,
 * combining {@link FieldsVisibilityMixin} and {@link DefaultFilterMixin}
 * for automatic hidden field exclusion and default filter application.
 *
 * @template EntitySchema - The Drizzle table schema type with an 'id' column
 * @template DataObject - The type of objects returned from queries
 * @template PersistObject - The type for insert/update operations
 * @template ExtraOptions - Additional options type extending IExtraOptions
 *
 * @example
 * **1. Zero boilerplate - dataSource auto-injected from @repository metadata:**
 * ```typescript
 * @repository({ model: User, dataSource: PostgresDataSource })
 * export class UserRepository extends DefaultCRUDRepository<typeof User.schema> {
 *   // No constructor needed - datasource auto-injected!
 * }
 * ```
 *
 * @example
 * **2. Explicit @inject:**
 * ```typescript
 * @repository({ model: User })
 * export class UserRepository extends DefaultCRUDRepository<typeof User.schema> {
 *   constructor(
 *     @inject({ key: 'datasources.PostgresDataSource' })
 *     dataSource: PostgresDataSource,
 *   ) {
 *     super(dataSource);
 *   }
 * }
 * ```
 */
export abstract class AbstractRepository<
  EntitySchema extends TTableSchemaWithId = TTableSchemaWithId,
  DataObject extends TTableObject<EntitySchema> = TTableObject<EntitySchema>,
  PersistObject extends TTableInsert<EntitySchema> = TTableInsert<EntitySchema>,
  ExtraOptions extends IExtraOptions = IExtraOptions,
>
  extends DefaultFilterMixin(FieldsVisibilityMixin(BaseHelper))
  implements IPersistableRepository<EntitySchema, DataObject, PersistObject, ExtraOptions>
{
  // ---------------------------------------------------------------------------
  // Properties
  // ---------------------------------------------------------------------------

  /**
   * Repository operation scope determining allowed operations.
   * @see {@link RepositoryOperationScopes}
   */
  protected _operationScope: TRepositoryOperationScope;

  /**
   * Filter builder instance for converting filter objects to Drizzle queries.
   * @see {@link FilterBuilder}
   */
  protected _filterBuilder: FilterBuilder;

  /**
   * The data source providing database connectivity.
   * Lazy-resolved on first access if not provided in constructor.
   */
  protected _dataSource?: IDataSource;

  /**
   * The entity/model instance associated with this repository.
   * Lazy-resolved from @repository metadata on first access.
   */
  protected _entity?: BaseEntity<EntitySchema>;

  // ---------------------------------------------------------------------------
  // Constructor
  // ---------------------------------------------------------------------------

  /**
   * Creates a new repository instance.
   *
   * @param ds - DataSource (auto-injected from @repository decorator or passed explicitly)
   * @param opts - Optional configuration
   * @param opts.scope - Custom scope name for logging
   * @param opts.entityClass - Entity class if not using @repository decorator
   * @param opts.operationScope - Operation scope (defaults to READ_ONLY)
   */
  constructor(
    ds?: IDataSource,
    opts?: {
      scope?: string;
      entityClass?: TClass<BaseEntity<EntitySchema>>;
      operationScope?: TRepositoryOperationScope;
    },
  ) {
    const scopeName =
      (opts?.scope ?? opts?.entityClass?.name)
        ? [opts?.entityClass?.name, 'Repository'].join('')
        : new.target.name;

    super({ scope: scopeName });

    this._operationScope = opts?.operationScope ?? RepositoryOperationScopes.READ_ONLY;
    this._filterBuilder = new FilterBuilder();

    if (ds) {
      this._dataSource = ds;
    }

    if (opts?.entityClass) {
      this._entity = new opts.entityClass();
    }
  }

  // ---------------------------------------------------------------------------
  // Public Accessors
  // ---------------------------------------------------------------------------

  /**
   * Gets the data source for database operations.
   * @throws Error if dataSource is not available
   */
  get dataSource(): IDataSource {
    if (!this._dataSource) {
      throw getError({
        message: `[${this.constructor.name}] DataSource not available. Use @repository({ model: YourModel, dataSource: YourDataSource }) or pass dataSource in constructor.`,
      });
    }
    return this._dataSource;
  }

  /** Sets the data source for database operations. */
  set dataSource(value: IDataSource) {
    this._dataSource = value;
  }

  /**
   * Gets the entity instance.
   * Auto-resolves from @repository metadata if not explicitly set.
   */
  get entity(): BaseEntity<EntitySchema> {
    if (!this._entity) {
      this._entity = this.resolveEntity();
    }
    return this._entity;
  }

  /** Sets the entity instance. */
  set entity(value: BaseEntity<EntitySchema>) {
    this._entity = value;
  }

  /** Gets the current operation scope (READ_ONLY, WRITE_ONLY, or READ_WRITE). */
  get operationScope() {
    return this._operationScope;
  }

  /** Gets the filter builder instance. */
  get filterBuilder() {
    return this._filterBuilder;
  }

  /** Gets the database connector from the data source. */
  get connector() {
    return this.dataSource.connector;
  }

  // ---------------------------------------------------------------------------
  // Public Instance Methods
  // ---------------------------------------------------------------------------

  /**
   * Sets the data source for this repository.
   * @param opts - Options containing the data source
   */
  setDataSource(opts: { dataSource: IDataSource }): void {
    this._dataSource = opts.dataSource;
  }

  /**
   * Returns the entity instance associated with this repository.
   * @returns The entity instance
   */
  getEntity(): BaseEntity<EntitySchema> {
    return this.entity;
  }

  /**
   * Returns the Drizzle table schema for this entity.
   * @returns The table schema
   */
  getEntitySchema(): EntitySchema {
    return this.entity.schema;
  }

  /**
   * Returns the database connector from the data source.
   * @returns The database connector
   */
  getConnector(): IDataSource['connector'] {
    return this.connector;
  }

  /**
   * Begins a new database transaction.
   * @param opts - Optional transaction configuration
   * @returns Promise resolving to the transaction instance
   */
  async beginTransaction(opts?: ITransactionOptions): Promise<ITransaction> {
    return this.dataSource.beginTransaction(opts);
  }

  /**
   * Builds Drizzle query options from a filter object.
   * Handles field visibility by excluding hidden properties.
   *
   * @param opts - Options containing the filter to convert
   * @returns Drizzle-compatible query options
   */
  buildQuery(opts: { filter: TFilter<DataObject> }): TDrizzleQueryOptions {
    const result = this.filterBuilder.build({
      tableName: this.entity.name,
      schema: this.entity.schema,
      filter: opts.filter,
    });

    if (!this.hasHiddenProperties()) {
      return result;
    }

    const hiddenProps = this.getHiddenProperties();

    if (result.columns) {
      // User specified fields - filter out hidden (single loop)
      const filteredColumns: Record<string, boolean> = {};
      for (const key in result.columns) {
        if (!hiddenProps.has(key)) {
          filteredColumns[key] = result.columns[key];
        }
      }
      result.columns = filteredColumns;
      return result;
    }

    // No fields specified - use cached visible properties keys
    const visibleProps = this.getVisibleProperties();
    if (visibleProps) {
      const filteredColumns: Record<string, boolean> = {};
      for (const key in visibleProps) {
        filteredColumns[key] = true;
      }
      result.columns = filteredColumns;
    }

    return result;
  }

  // ---------------------------------------------------------------------------
  // Entity Resolution (protected)
  // ---------------------------------------------------------------------------

  /**
   * Resolves the entity instance from @repository metadata.
   * Called lazily when entity is first accessed.
   *
   * @returns The resolved entity instance
   * @throws Error if entity cannot be resolved from metadata
   */
  protected resolveEntity(): BaseEntity<EntitySchema> {
    const registry = MetadataRegistry.getInstance();
    const binding = registry.getRepositoryBinding({
      name: this.constructor.name,
    });

    if (!binding?.model) {
      throw getError({
        message: `[${this.constructor.name}] Cannot resolve entity. Either pass entityClass in constructor or use @repository decorator with model option.`,
      });
    }

    // Cast to TClass - at runtime this is always a class constructor
    const ctor = resolveValue(binding.model) as TClass<BaseEntity<EntitySchema>>;
    return new ctor();
  }

  // ---------------------------------------------------------------------------
  // Transaction Support (protected)
  // ---------------------------------------------------------------------------

  /**
   * Resolves the database connector, using transaction connector if provided.
   *
   * @param opts - Options containing optional transaction
   * @returns The database connector (from transaction or default data source)
   * @throws Error if transaction is no longer active
   */
  protected resolveConnector(opts?: { transaction?: ITransaction }): TAnyConnector {
    const transaction = opts?.transaction;

    if (!transaction) {
      return this.dataSource.connector;
    }

    if (!transaction.isActive) {
      throw getError({
        message: `[${this.constructor.name}][resolveConnector] Transaction is no longer active`,
      });
    }

    return transaction.connector;
  }

  /**
   * Gets the Drizzle query interface for this entity.
   * Validates that the schema is properly registered in the connector.
   *
   * @param opts - Options containing extra options with optional transaction
   * @returns The Drizzle query interface for this entity
   * @throws Error if connector.query is not available
   * @throws Error if entity schema is not registered in connector
   */
  protected getQueryInterface(opts?: { options?: ExtraOptions }) {
    const connector = this.resolveConnector({ transaction: opts?.options?.transaction });

    // Validate connector.query exists
    if (!connector.query) {
      throw getError({
        message: `[${this.constructor.name}] Connector query interface not available | Ensure datasource is properly configured with schema`,
      });
    }

    const queryInterface = connector.query[this.entity.name];
    if (!queryInterface) {
      const availableKeys = Object.keys(connector.query);
      throw getError({
        message: `[${this.constructor.name}] Schema key mismatch | Entity name '${this.entity.name}' not found in connector.query | Available keys: [${availableKeys.join(', ')}] | Ensure the model's TABLE_NAME matches the schema registration key`,
      });
    }

    return queryInterface;
  }

  // ---------------------------------------------------------------------------
  // Abstract Methods - Read Operations
  // ---------------------------------------------------------------------------

  /**
   * Counts records matching the where condition.
   * Must be implemented by subclasses.
   */
  abstract count(opts: { where: TWhere<DataObject>; options?: ExtraOptions }): Promise<TCount>;

  /**
   * Checks if any records match the where condition.
   * Must be implemented by subclasses.
   */
  abstract existsWith(opts: {
    where: TWhere<DataObject>;
    options?: ExtraOptions;
  }): Promise<boolean>;

  /**
   * Finds all records matching the filter.
   * Must be implemented by subclasses.
   */
  abstract find<R = DataObject>(opts: {
    filter: TFilter<DataObject>;
    options?: ExtraOptions;
  }): Promise<R[]>;

  /**
   * Finds the first record matching the filter.
   * Must be implemented by subclasses.
   */
  abstract findOne<R = DataObject>(opts: {
    filter: TFilter<DataObject>;
    options?: ExtraOptions;
  }): Promise<TNullable<R>>;

  /**
   * Finds a record by its ID.
   * Must be implemented by subclasses.
   */
  abstract findById<R = DataObject>(opts: {
    id: IdType;
    filter?: Omit<TFilter<DataObject>, 'where'>;
    options?: ExtraOptions;
  }): Promise<TNullable<R>>;

  // ---------------------------------------------------------------------------
  // Abstract Methods - Create Operations
  // ---------------------------------------------------------------------------

  /**
   * Creates a single record (without returning it).
   * Must be implemented by subclasses.
   */
  abstract create(opts: {
    data: PersistObject;
    options: ExtraOptions & { shouldReturn: false };
  }): Promise<TCount & { data: undefined | null }>;

  /**
   * Creates a single record and returns it.
   * Must be implemented by subclasses.
   */
  abstract create<R = DataObject>(opts: {
    data: PersistObject;
    options?: ExtraOptions & { shouldReturn?: true };
  }): Promise<TCount & { data: R }>;

  /**
   * Creates multiple records (without returning them).
   * Must be implemented by subclasses.
   */
  abstract createAll(opts: {
    data: Array<PersistObject>;
    options: ExtraOptions & { shouldReturn: false };
  }): Promise<TCount & { data: undefined | null }>;

  /**
   * Creates multiple records and returns them.
   * Must be implemented by subclasses.
   */
  abstract createAll<R = DataObject>(opts: {
    data: Array<PersistObject>;
    options?: ExtraOptions & { shouldReturn?: true };
  }): Promise<TCount & { data: Array<R> }>;

  // ---------------------------------------------------------------------------
  // Abstract Methods - Update Operations
  // ---------------------------------------------------------------------------

  /**
   * Updates a record by ID (without returning it).
   * Must be implemented by subclasses.
   */
  abstract updateById(opts: {
    id: IdType;
    data: Partial<PersistObject>;
    options: ExtraOptions & { shouldReturn: false };
  }): Promise<TCount & { data: undefined | null }>;

  /**
   * Updates a record by ID and returns it.
   * Must be implemented by subclasses.
   */
  abstract updateById<R = DataObject>(opts: {
    id: IdType;
    data: Partial<PersistObject>;
    options?: ExtraOptions & { shouldReturn?: true };
  }): Promise<TCount & { data: R }>;

  /**
   * Updates all records matching the where condition (without returning them).
   * Must be implemented by subclasses.
   */
  abstract updateAll(opts: {
    data: Partial<PersistObject>;
    where: TWhere<DataObject>;
    options: ExtraOptions & { shouldReturn: false; force?: boolean };
  }): Promise<TCount & { data: undefined | null }>;

  /**
   * Updates all records matching the where condition and returns them.
   * Must be implemented by subclasses.
   */
  abstract updateAll<R = DataObject>(opts: {
    data: Partial<PersistObject>;
    where: TWhere<DataObject>;
    options?: ExtraOptions & { shouldReturn?: true; force?: boolean };
  }): Promise<TCount & { data: Array<R> }>;

  /**
   * Alias for updateAll. Updates records matching the where condition.
   * Delegates to updateAll with the same parameters.
   */
  updateBy(opts: {
    data: Partial<PersistObject>;
    where: TWhere<DataObject>;
    options: ExtraOptions & { shouldReturn: false; force?: boolean };
  }): Promise<TCount & { data: undefined | null }>;
  updateBy<R = DataObject>(opts: {
    data: Partial<PersistObject>;
    where: TWhere<DataObject>;
    options?: ExtraOptions & { shouldReturn?: true; force?: boolean };
  }): Promise<TCount & { data: Array<R> }>;
  updateBy<R = DataObject>(opts: {
    data: Partial<PersistObject>;
    where: TWhere<DataObject>;
    options?: ExtraOptions & { shouldReturn?: boolean; force?: boolean };
  }): Promise<TCount & { data: TNullable<Array<R>> }> {
    if (opts.options?.shouldReturn === false) {
      const strictOpts = opts as {
        data: Partial<PersistObject>;
        where: TWhere<DataObject>;
        options: ExtraOptions & {
          shouldReturn: false;
          force?: boolean;
          log?: TRepositoryLogOptions;
        };
      };
      return this.updateAll(strictOpts);
    }

    const strictOpts = opts as {
      data: Partial<PersistObject>;
      where: TWhere<DataObject>;
      options?: ExtraOptions & {
        shouldReturn?: true;
        force?: boolean;
        log?: TRepositoryLogOptions;
      };
    };
    return this.updateAll<R>(strictOpts);
  }

  // ---------------------------------------------------------------------------
  // Abstract Methods - Delete Operations
  // ---------------------------------------------------------------------------

  /**
   * Deletes a record by ID (without returning it).
   * Must be implemented by subclasses.
   */
  abstract deleteById(opts: {
    id: IdType;
    options: ExtraOptions & { shouldReturn: false };
  }): Promise<TCount & { data: undefined | null }>;

  /**
   * Deletes a record by ID and returns it.
   * Must be implemented by subclasses.
   */
  abstract deleteById<R = DataObject>(opts: {
    id: IdType;
    options?: ExtraOptions & { shouldReturn?: true };
  }): Promise<TCount & { data: R }>;

  /**
   * Deletes all records matching the where condition (without returning them).
   * Must be implemented by subclasses.
   */
  abstract deleteAll(opts: {
    where: TWhere<DataObject>;
    options: ExtraOptions & { shouldReturn: false; force?: boolean };
  }): Promise<TCount & { data: undefined | null }>;

  /**
   * Deletes all records matching the where condition and returns them.
   * Must be implemented by subclasses.
   */
  abstract deleteAll<R = DataObject>(opts: {
    where: TWhere<DataObject>;
    options?: ExtraOptions & { shouldReturn?: true; force?: boolean };
  }): Promise<TCount & { data: Array<R> }>;

  /**
   * Alias for deleteAll. Deletes records matching the where condition.
   * Delegates to deleteAll with the same parameters.
   */
  deleteBy(opts: {
    where: TWhere<DataObject>;
    options: ExtraOptions & { shouldReturn: false; force?: boolean };
  }): Promise<TCount & { data: undefined | null }>;
  deleteBy<R = DataObject>(opts: {
    where: TWhere<DataObject>;
    options?: ExtraOptions & { shouldReturn?: true; force?: boolean };
  }): Promise<TCount & { data: Array<R> }>;
  deleteBy<R = DataObject>(opts: {
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
