import { IDataSource, ITransaction, ITransactionOptions, TAnyConnector } from '@/base/datasources';
import { BaseEntity, IdType, TTableInsert, TTableObject, TTableSchemaWithId } from '@/base/models';
import { MetadataRegistry } from '@/helpers/inversion';
import { BaseHelper, getError, resolveValue, TClass, TNullable } from '@venizia/ignis-helpers';
import {
  IExtraOptions,
  IPersistableRepository,
  RepositoryOperationScopes,
  TCount,
  TDataRange,
  TDrizzleQueryOptions,
  TFilter,
  TRepositoryLogOptions,
  TRepositoryOperationScope,
  TWhere,
} from '../common';
import { DefaultFilterMixin, FieldsVisibilityMixin } from '../mixins';
import { FilterBuilder } from '../operators';

/** Abstract base repository combining FieldsVisibilityMixin and DefaultFilterMixin. */
export abstract class AbstractRepository<
  EntitySchema extends TTableSchemaWithId = TTableSchemaWithId,
  DataObject extends TTableObject<EntitySchema> = TTableObject<EntitySchema>,
  PersistObject extends TTableInsert<EntitySchema> = TTableInsert<EntitySchema>,
  ExtraOptions extends IExtraOptions = IExtraOptions,
>
  extends DefaultFilterMixin(FieldsVisibilityMixin(BaseHelper))
  implements IPersistableRepository<EntitySchema, DataObject, PersistObject, ExtraOptions>
{
  protected _operationScope: TRepositoryOperationScope;
  protected _filterBuilder: FilterBuilder;
  /** Lazy-resolved on first access if not provided in constructor. */
  protected _dataSource?: IDataSource;
  /** Lazy-resolved from @repository metadata on first access. */
  protected _entity?: BaseEntity<EntitySchema>;
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

  /** Auto-resolves from @repository metadata if not explicitly set. */
  get entity(): BaseEntity<EntitySchema> {
    if (!this._entity) {
      this._entity = this.resolveEntity();
    }
    return this._entity;
  }

  set entity(value: BaseEntity<EntitySchema>) {
    this._entity = value;
  }

  get operationScope() {
    return this._operationScope;
  }

  get filterBuilder() {
    return this._filterBuilder;
  }

  get connector() {
    return this.dataSource.connector;
  }
  setDataSource(opts: { dataSource: IDataSource }): void {
    this._dataSource = opts.dataSource;
  }

  getEntity(): BaseEntity<EntitySchema> {
    return this.entity;
  }

  getEntitySchema(): EntitySchema {
    return this.entity.schema;
  }

  getConnector(): IDataSource['connector'] {
    return this.connector;
  }

  async beginTransaction(opts?: ITransactionOptions): Promise<ITransaction> {
    return this.dataSource.beginTransaction(opts);
  }

  /** Builds Drizzle query options from a filter, excluding hidden properties. */
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
  /** Resolves the entity instance from @repository metadata on first access. */
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
  /** Resolves the database connector, using transaction connector if provided. */
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

  /** Gets the Drizzle query interface, validating schema registration. */
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
  abstract count(opts: { where: TWhere<DataObject>; options?: ExtraOptions }): Promise<TCount>;

  abstract existsWith(opts: {
    where: TWhere<DataObject>;
    options?: ExtraOptions;
  }): Promise<boolean>;

  abstract find<R = DataObject>(opts: {
    filter: TFilter<DataObject>;
    options: ExtraOptions & { shouldQueryRange: true };
  }): Promise<{ data: Array<R>; range: TDataRange }>;

  abstract find<R = DataObject>(opts: {
    filter: TFilter<DataObject>;
    options?: ExtraOptions & { shouldQueryRange?: false };
  }): Promise<R[]>;

  abstract findOne<R = DataObject>(opts: {
    filter: TFilter<DataObject>;
    options?: ExtraOptions;
  }): Promise<TNullable<R>>;

  abstract findById<R = DataObject>(opts: {
    id: IdType;
    filter?: Omit<TFilter<DataObject>, 'where'>;
    options?: ExtraOptions;
  }): Promise<TNullable<R>>;

  abstract create(opts: {
    data: PersistObject;
    options: ExtraOptions & { shouldReturn: false };
  }): Promise<TCount & { data: undefined | null }>;

  abstract create<R = DataObject>(opts: {
    data: PersistObject;
    options?: ExtraOptions & { shouldReturn?: true };
  }): Promise<TCount & { data: R }>;

  abstract createAll(opts: {
    data: Array<PersistObject>;
    options: ExtraOptions & { shouldReturn: false };
  }): Promise<TCount & { data: undefined | null }>;

  abstract createAll<R = DataObject>(opts: {
    data: Array<PersistObject>;
    options?: ExtraOptions & { shouldReturn?: true };
  }): Promise<TCount & { data: Array<R> }>;

  abstract updateById(opts: {
    id: IdType;
    data: Partial<PersistObject>;
    options: ExtraOptions & { shouldReturn: false };
  }): Promise<TCount & { data: undefined | null }>;

  abstract updateById<R = DataObject>(opts: {
    id: IdType;
    data: Partial<PersistObject>;
    options?: ExtraOptions & { shouldReturn?: true };
  }): Promise<TCount & { data: R }>;

  abstract updateAll(opts: {
    data: Partial<PersistObject>;
    where: TWhere<DataObject>;
    options: ExtraOptions & { shouldReturn: false; force?: boolean };
  }): Promise<TCount & { data: undefined | null }>;

  abstract updateAll<R = DataObject>(opts: {
    data: Partial<PersistObject>;
    where: TWhere<DataObject>;
    options?: ExtraOptions & { shouldReturn?: true; force?: boolean };
  }): Promise<TCount & { data: Array<R> }>;

  /** Alias for updateAll. */
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
  abstract deleteById(opts: {
    id: IdType;
    options: ExtraOptions & { shouldReturn: false };
  }): Promise<TCount & { data: undefined | null }>;

  abstract deleteById<R = DataObject>(opts: {
    id: IdType;
    options?: ExtraOptions & { shouldReturn?: true };
  }): Promise<TCount & { data: R }>;

  abstract deleteAll(opts: {
    where: TWhere<DataObject>;
    options: ExtraOptions & { shouldReturn: false; force?: boolean };
  }): Promise<TCount & { data: undefined | null }>;

  abstract deleteAll<R = DataObject>(opts: {
    where: TWhere<DataObject>;
    options?: ExtraOptions & { shouldReturn?: true; force?: boolean };
  }): Promise<TCount & { data: Array<R> }>;

  /** Alias for deleteAll. */
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
