import { IDataSource, ITransaction, ITransactionOptions, TAnyConnector } from '@/base/datasources';
import { BaseEntity, IdType, TTableInsert, TTableSchemaWithId } from '@/base/models';
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

/**
 * Base repository class with dependency injection support.
 *
 * Supports injection patterns:
 *
 * 1. Zero boilerplate - dataSource auto-injected from @repository metadata:
 * ```typescript
 * @repository({ model: User, dataSource: PostgresDataSource })
 * export class UserRepository extends DefaultCRUDRepository<typeof User.schema> {
 *   // No constructor needed - datasource auto-injected!
 * }
 * ```
 *
 * 2. Explicit @inject:
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
  Schema extends TTableSchemaWithId = TTableSchemaWithId,
  DataObject extends Schema['$inferSelect'] = Schema['$inferSelect'],
  PersistObject extends TTableInsert<Schema> = TTableInsert<Schema>,
  ExtraOptions extends IExtraOptions = IExtraOptions,
>
  extends DefaultFilterMixin(FieldsVisibilityMixin(BaseHelper))
  implements IPersistableRepository<Schema, DataObject, PersistObject, ExtraOptions>
{
  // ---------------------------------------------------------------------------
  // Properties
  // ---------------------------------------------------------------------------

  /** Repository operation scope (READ_ONLY or READ_WRITE) */
  protected operationScope: TRepositoryOperationScope;

  /** Filter builder instance for query construction */
  filterBuilder: FilterBuilder;

  // Lazy-resolved properties (resolved on first access)
  private _dataSource?: IDataSource;
  private _entity?: BaseEntity<Schema>;

  // ---------------------------------------------------------------------------
  // Constructor
  // ---------------------------------------------------------------------------

  /**
   * @param ds - DataSource (auto-injected from @repository decorator or passed explicitly)
   * @param opts - Optional configuration
   */
  constructor(
    ds?: IDataSource,
    opts?: {
      scope?: string;
      entityClass?: TClass<BaseEntity<Schema>>;
      operationScope?: TRepositoryOperationScope;
    },
  ) {
    const scopeName =
      (opts?.scope ?? opts?.entityClass?.name)
        ? [opts?.entityClass?.name, 'Repository'].join('')
        : new.target.name;

    super({ scope: scopeName });

    this.operationScope = opts?.operationScope ?? RepositoryOperationScopes.READ_ONLY;
    this.filterBuilder = new FilterBuilder();

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
   * Get dataSource - must be injected via @repository decorator or constructor
   */
  get dataSource(): IDataSource {
    if (!this._dataSource) {
      throw getError({
        message: `[${this.constructor.name}] DataSource not available. Use @repository({ model: YourModel, dataSource: YourDataSource }) or pass dataSource in constructor.`,
      });
    }
    return this._dataSource;
  }

  set dataSource(value: IDataSource) {
    this._dataSource = value;
  }

  /**
   * Get entity - auto-resolves from @repository metadata if not explicitly set
   */
  get entity(): BaseEntity<Schema> {
    if (!this._entity) {
      this._entity = this.resolveEntity();
    }
    return this._entity;
  }

  set entity(value: BaseEntity<Schema>) {
    this._entity = value;
  }

  /**
   * Get database connector from dataSource
   */
  get connector() {
    return this.dataSource.connector;
  }

  // ---------------------------------------------------------------------------
  // Public Instance Methods
  // ---------------------------------------------------------------------------

  setDataSource(opts: { dataSource: IDataSource }): void {
    this._dataSource = opts.dataSource;
  }

  getEntity(): BaseEntity<Schema> {
    return this.entity;
  }

  getEntitySchema(): Schema {
    return this.entity.schema;
  }

  getConnector(): IDataSource['connector'] {
    return this.connector;
  }

  async beginTransaction(opts?: ITransactionOptions): Promise<ITransaction> {
    return this.dataSource.beginTransaction(opts);
  }

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
  // Entity & Relations Resolution (protected)
  // ---------------------------------------------------------------------------

  /**
   * Resolve entity from @repository metadata
   */
  protected resolveEntity(): BaseEntity<Schema> {
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
    const ctor = resolveValue(binding.model) as TClass<BaseEntity<Schema>>;
    return new ctor();
  }

  // ---------------------------------------------------------------------------
  // Transaction Support (protected)
  // ---------------------------------------------------------------------------

  /**
   * Resolve connector from transaction or use default dataSource connector.
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

  // ---------------------------------------------------------------------------
  // Abstract Methods - Read Operations
  // ---------------------------------------------------------------------------

  abstract count(opts: { where: TWhere<DataObject>; options?: ExtraOptions }): Promise<TCount>;

  abstract existsWith(opts: {
    where: TWhere<DataObject>;
    options?: ExtraOptions;
  }): Promise<boolean>;

  abstract find<R = DataObject>(opts: {
    filter: TFilter<DataObject>;
    options?: ExtraOptions;
  }): Promise<R[]>;

  abstract findOne<R = DataObject>(opts: {
    filter: TFilter<DataObject>;
    options?: ExtraOptions;
  }): Promise<TNullable<R>>;

  abstract findById<R = DataObject>(opts: {
    id: IdType;
    filter?: TFilter<DataObject> | undefined;
    options?: ExtraOptions;
  }): Promise<TNullable<R>>;

  // ---------------------------------------------------------------------------
  // Abstract Methods - Create Operations
  // ---------------------------------------------------------------------------

  abstract create(opts: {
    data: PersistObject;
    options: ExtraOptions & { shouldReturn: false; log?: TRepositoryLogOptions };
  }): Promise<TCount & { data: null }>;

  abstract create<R = Schema['$inferSelect']>(opts: {
    data: PersistObject;
    options?: ExtraOptions & { shouldReturn?: true; log?: TRepositoryLogOptions };
  }): Promise<TCount & { data: R }>;

  abstract createAll(opts: {
    data: Array<PersistObject>;
    options: ExtraOptions & { shouldReturn: false; log?: TRepositoryLogOptions };
  }): Promise<TCount & { data: null }>;

  abstract createAll<R = Schema['$inferSelect']>(opts: {
    data: Array<PersistObject>;
    options?: ExtraOptions & { shouldReturn?: true; log?: TRepositoryLogOptions };
  }): Promise<TCount & { data: Array<R> }>;

  // ---------------------------------------------------------------------------
  // Abstract Methods - Update Operations
  // ---------------------------------------------------------------------------

  abstract updateById(opts: {
    id: IdType;
    data: Partial<PersistObject>;
    options: ExtraOptions & { shouldReturn: false; log?: TRepositoryLogOptions };
  }): Promise<TCount & { data: null }>;

  abstract updateById<R = Schema['$inferSelect']>(opts: {
    id: IdType;
    data: Partial<PersistObject>;
    options?: ExtraOptions & { shouldReturn?: true; log?: TRepositoryLogOptions };
  }): Promise<TCount & { data: R }>;

  abstract updateAll(opts: {
    data: Partial<PersistObject>;
    where: TWhere<DataObject>;
    options: ExtraOptions & {
      shouldReturn: false;
      force?: boolean;
      log?: TRepositoryLogOptions;
    };
  }): Promise<TCount & { data: null }>;

  abstract updateAll<R = Schema['$inferSelect']>(opts: {
    data: Partial<PersistObject>;
    where: TWhere<DataObject>;
    options?: ExtraOptions & {
      shouldReturn?: true;
      force?: boolean;
      log?: TRepositoryLogOptions;
    };
  }): Promise<TCount & { data: Array<R> }>;

  updateBy(opts: {
    data: Partial<PersistObject>;
    where: TWhere<DataObject>;
    options: ExtraOptions & {
      shouldReturn: false;
      force?: boolean;
      log?: TRepositoryLogOptions;
    };
  }): Promise<TCount & { data: null }>;
  updateBy<R = Schema['$inferSelect']>(opts: {
    data: Partial<PersistObject>;
    where: TWhere<DataObject>;
    options?: ExtraOptions & {
      shouldReturn?: true;
      force?: boolean;
      log?: TRepositoryLogOptions;
    };
  }): Promise<TCount & { data: Array<R> }>;
  updateBy<R = Schema['$inferSelect']>(opts: {
    data: Partial<PersistObject>;
    where: TWhere<DataObject>;
    options?: ExtraOptions & {
      shouldReturn?: boolean;
      force?: boolean;
      log?: TRepositoryLogOptions;
    };
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

  abstract deleteById(opts: {
    id: IdType;
    options: ExtraOptions & { shouldReturn: false; log?: TRepositoryLogOptions };
  }): Promise<TCount & { data: null }>;

  abstract deleteById<R = Schema['$inferSelect']>(opts: {
    id: IdType;
    options?: ExtraOptions & { shouldReturn?: true; log?: TRepositoryLogOptions };
  }): Promise<TCount & { data: R }>;

  abstract deleteAll(opts: {
    where: TWhere<DataObject>;
    options: ExtraOptions & {
      shouldReturn: false;
      force?: boolean;
      log?: TRepositoryLogOptions;
    };
  }): Promise<TCount & { data: null }>;

  abstract deleteAll<R = Schema['$inferSelect']>(opts: {
    where: TWhere<DataObject>;
    options?: ExtraOptions & {
      shouldReturn?: true;
      force?: boolean;
      log?: TRepositoryLogOptions;
    };
  }): Promise<TCount & { data: Array<R> }>;

  deleteBy(opts: {
    where: TWhere<DataObject>;
    options: ExtraOptions & {
      shouldReturn: false;
      force?: boolean;
      log?: TRepositoryLogOptions;
    };
  }): Promise<TCount & { data: null }>;
  deleteBy<R = Schema['$inferSelect']>(opts: {
    where: TWhere<DataObject>;
    options?: ExtraOptions & {
      shouldReturn?: true;
      force?: boolean;
      log?: TRepositoryLogOptions;
    };
  }): Promise<TCount & { data: Array<R> }>;
  deleteBy<R = Schema['$inferSelect']>(opts: {
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
