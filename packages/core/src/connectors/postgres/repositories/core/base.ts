import { ITransaction } from '@/base/datasources';
import { AbstractRepository } from '@/base/repositories/core';
import { IdType } from '@/base/models';
import {
  IPostgresDataSource,
  IDatabaseTransaction,
  IDatabaseTransactionOptions,
  isDatabaseTransaction,
  TAnyConnector,
} from '@/connectors/postgres/datasources';
import {
  BasePostgresEntity,
  TTableInsert,
  TTableObject,
  TTableSchemaWithId,
} from '@/connectors/postgres/models';
import { getError, TClass, TNullable } from '@venizia/ignis-helpers';
import { getTableColumns } from 'drizzle-orm';
import {
  IExtraOptions,
  IPersistableRepository,
  TCount,
  TDataRange,
  TDrizzleQueryOptions,
  TFilter,
  TLockOptions,
  TRepositoryOperationScope,
  TWhere,
} from '@/base/repositories/common';
import { FilterBuilder } from '../operators';
import { IDatabaseExtraOptions } from '../common';

/** Postgres implementation of `AbstractRepository`: adds FilterBuilder + hidden-column exclusion
 * and defaults `ExtraOptions` to `IDatabaseExtraOptions` so `options.transaction.connector` needs no cast. */
export abstract class PostgresBaseRepository<
  EntitySchema extends TTableSchemaWithId = TTableSchemaWithId,
  DataObject extends TTableObject<EntitySchema> = TTableObject<EntitySchema>,
  PersistObject extends TTableInsert<EntitySchema> = TTableInsert<EntitySchema>,
  ExtraOptions extends IExtraOptions = IDatabaseExtraOptions,
>
  extends AbstractRepository<DataObject, PersistObject, ExtraOptions>
  implements IPersistableRepository<DataObject, PersistObject, ExtraOptions>
{
  protected _filterBuilder: FilterBuilder;

  /** Memoized Set view of the base's `hiddenFields` array - built once on first access. */
  private _hiddenPropertySet: Set<string> | null = null;
  /** Memoized Drizzle column-selection map derived from hidden fields. `null` = not yet computed; `undefined` = computed, no hidden fields. */
  private _visibleColumns: Record<string, unknown> | null | undefined = null;

  constructor(
    dataSource?: IPostgresDataSource,
    opts?: {
      scope?: string;
      entityClass?: TClass<BasePostgresEntity<EntitySchema>>;
      operationScope?: TRepositoryOperationScope;
    },
  ) {
    super(dataSource, opts);
    this._filterBuilder = new FilterBuilder();
  }

  override get dataSource(): IPostgresDataSource {
    // AbstractRepository's getter is engine-neutral (AbstractDataSource); every postgres repository
    // is only ever constructed with an IPostgresDataSource (see constructor), so the narrowing is
    // sound but not provable from the base class's stored type alone.
    return super.dataSource as IPostgresDataSource;
  }

  override set dataSource(value: IPostgresDataSource) {
    super.dataSource = value;
  }

  override get entity(): BasePostgresEntity<EntitySchema> {
    // Same engine-neutral-base-vs-concrete-connector narrowing as the dataSource getter above.
    return super.entity as BasePostgresEntity<EntitySchema>;
  }

  override set entity(value: BasePostgresEntity<EntitySchema>) {
    super.entity = value;
  }

  get filterBuilder(): FilterBuilder {
    return this._filterBuilder;
  }

  get connector() {
    return this.dataSource.connector;
  }

  override setDataSource(opts: { dataSource: IPostgresDataSource }): void {
    super.setDataSource(opts);
  }

  getEntitySchema(): EntitySchema {
    return this.entity.schema;
  }

  getConnector(): IPostgresDataSource['connector'] {
    return this.connector;
  }

  /** Hidden fields as a memoized Set, derived from the base's class-keyed `hiddenFields` array. */
  getHiddenProperties(): Set<string> {
    if (this._hiddenPropertySet === null) {
      this._hiddenPropertySet = new Set(this.hiddenFields);
    }
    return this._hiddenPropertySet;
  }

  hasHiddenProperties(): boolean {
    return this.getHiddenProperties().size > 0;
  }

  /** Drizzle select/returning column map excluding hidden properties. Undefined if none hidden. Memoized. */
  getVisibleProperties(): Record<string, any> | undefined {
    if (this._visibleColumns !== null) {
      return this._visibleColumns;
    }

    const hiddenProps = this.getHiddenProperties();

    if (hiddenProps.size === 0) {
      this._visibleColumns = undefined;
      return undefined;
    }

    const columns = getTableColumns(this.entity.schema);
    const visibleProperties: Record<string, any> = {};

    for (const key in columns) {
      if (!hiddenProps.has(key)) {
        visibleProperties[key] = columns[key];
      }
    }

    this._visibleColumns = visibleProperties;
    return this._visibleColumns;
  }

  /** Full @model settings.defaultFilter (where/order/limit/...) - unlike the base's narrower
   * `defaultWhere`, this preserves FilterBuilder.mergeFilter's existing full-filter merge. */
  getDefaultFilter(): TFilter | undefined {
    return this.modelSettings?.defaultFilter;
  }

  getDefaultLimit(): number | undefined {
    return this.defaultLimit;
  }

  hasDefaultFilter(): boolean {
    const defaultFilter = this.getDefaultFilter();
    return defaultFilter !== undefined && Object.keys(defaultFilter).length > 0;
  }

  /** Merges default filter with user filter. Skippable via shouldSkipDefaultFilter. */
  applyDefaultFilter<DO = any>(opts: {
    userFilter?: TFilter<DO>;
    shouldSkipDefaultFilter?: boolean;
  }): TFilter<DO> {
    const { userFilter, shouldSkipDefaultFilter } = opts;

    if (shouldSkipDefaultFilter) {
      return userFilter ?? {};
    }

    const defaultFilter = this.getDefaultFilter();
    if (!defaultFilter) {
      return userFilter ?? {};
    }

    return this.filterBuilder.mergeFilter({ defaultFilter, userFilter });
  }

  async beginTransaction(opts?: IDatabaseTransactionOptions): Promise<IDatabaseTransaction> {
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

  /** Resolves the database connector, using the transaction's connector if provided. */
  protected resolveConnector(opts?: { transaction?: ITransaction }): TAnyConnector {
    const { transaction } = opts ?? {};

    if (!transaction) {
      return this.dataSource.connector;
    }

    if (!transaction.isActive) {
      throw getError({
        message: `[${this.constructor.name}][resolveConnector] Transaction is no longer active`,
      });
    }

    if (!isDatabaseTransaction(transaction)) {
      throw getError({
        message: `[${this.constructor.name}][resolveConnector] Transaction is not a postgres transaction`,
      });
    }

    return transaction.connector;
  }

  /** Validates lock options: requires transaction, incompatible with Query API (include/fields). */
  protected validateLockOptions(opts: {
    lock?: TLockOptions;
    transaction?: ITransaction;
    usesQueryAPI?: boolean;
  }): void {
    if (!opts.lock) {
      return;
    }

    if (!opts.transaction) {
      throw getError({
        message: `[${this.constructor.name}][validateLockOptions] Row-level locking requires a transaction`,
      });
    }

    if (opts.usesQueryAPI) {
      throw getError({
        message: `[${this.constructor.name}][validateLockOptions] Row-level locking is incompatible with Query API`,
      });
    }
  }

  /** Gets the Drizzle query interface, validating schema registration. */
  protected getQueryInterface(opts?: { options?: ExtraOptions }) {
    const connector = this.resolveConnector({ transaction: opts?.options?.transaction });

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

  abstract override count(opts: {
    where: TWhere<DataObject>;
    options?: ExtraOptions;
  }): Promise<TCount>;

  abstract override existsWith(opts: {
    where: TWhere<DataObject>;
    options?: ExtraOptions;
  }): Promise<boolean>;

  abstract override find<R = DataObject>(opts: {
    filter: TFilter<DataObject>;
    options: ExtraOptions & { shouldQueryRange: true };
  }): Promise<{ data: Array<R>; range: TDataRange }>;

  abstract override find<R = DataObject>(opts: {
    filter: TFilter<DataObject>;
    options?: ExtraOptions & { shouldQueryRange?: false };
  }): Promise<R[]>;

  abstract override findOne<R = DataObject>(opts: {
    filter: TFilter<DataObject>;
    options?: ExtraOptions;
  }): Promise<TNullable<R>>;

  abstract override findById<R = DataObject>(opts: {
    id: IdType;
    filter?: Omit<TFilter<DataObject>, 'where'>;
    options?: ExtraOptions;
  }): Promise<TNullable<R>>;

  abstract override create(opts: {
    data: PersistObject;
    options: ExtraOptions & { shouldReturn: false };
  }): Promise<TCount & { data: undefined | null }>;

  abstract override create<R = DataObject>(opts: {
    data: PersistObject;
    options?: ExtraOptions & { shouldReturn?: true };
  }): Promise<TCount & { data: R }>;

  abstract override createAll(opts: {
    data: Array<PersistObject>;
    options: ExtraOptions & { shouldReturn: false };
  }): Promise<TCount & { data: undefined | null }>;

  abstract override createAll<R = DataObject>(opts: {
    data: Array<PersistObject>;
    options?: ExtraOptions & { shouldReturn?: true };
  }): Promise<TCount & { data: Array<R> }>;

  abstract override updateById(opts: {
    id: IdType;
    data: Partial<PersistObject>;
    options: ExtraOptions & { shouldReturn: false };
  }): Promise<TCount & { data: undefined | null }>;

  abstract override updateById<R = DataObject>(opts: {
    id: IdType;
    data: Partial<PersistObject>;
    options?: ExtraOptions & { shouldReturn?: true };
  }): Promise<TCount & { data: R }>;

  abstract override updateAll(opts: {
    data: Partial<PersistObject>;
    where: TWhere<DataObject>;
    options: ExtraOptions & { shouldReturn: false; force?: boolean };
  }): Promise<TCount & { data: undefined | null }>;

  abstract override updateAll<R = DataObject>(opts: {
    data: Partial<PersistObject>;
    where: TWhere<DataObject>;
    options?: ExtraOptions & { shouldReturn?: true; force?: boolean };
  }): Promise<TCount & { data: Array<R> }>;

  // updateBy is inherited as-is - it already delegates to this class's overridden updateAll.

  abstract override deleteById(opts: {
    id: IdType;
    options: ExtraOptions & { shouldReturn: false };
  }): Promise<TCount & { data: undefined | null }>;

  abstract override deleteById<R = DataObject>(opts: {
    id: IdType;
    options?: ExtraOptions & { shouldReturn?: true };
  }): Promise<TCount & { data: R }>;

  abstract override deleteAll(opts: {
    where?: TWhere<DataObject>;
    options: ExtraOptions & { shouldReturn: false; force?: boolean };
  }): Promise<TCount & { data: undefined | null }>;

  abstract override deleteAll<R = DataObject>(opts: {
    where?: TWhere<DataObject>;
    options?: ExtraOptions & { shouldReturn?: true; force?: boolean };
  }): Promise<TCount & { data: Array<R> }>;

  // deleteBy is inherited as-is - same rationale as updateBy above.
}
