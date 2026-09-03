import type {
  IdType,
  IExtraOptions,
  IPersistableRepository,
  IScopeFilterSettings,
  ITransaction,
  TCount,
  TDataRange,
  TDrizzleQueryOptions,
  TFilter,
  TFindOneOptions,
  TFindOptions,
  TFindRangeOptions,
  TLockOptions,
  TRepositoryOperationScope,
  TWhere,
} from '@venizia/ignis-kernel';
import {
  AbstractRepository,
  ScopeFilterMissingBehaviors,
  ScopeFilters,
} from '@venizia/ignis-kernel';
// Deep import, not the `@/relational/core/datasources` barrel: the barrel pulls the datasource classes, which import the engine branch's dialect and executor - an init cycle back into this tier.
import type { IRelationalDataSource } from '@/relational/core/datasources/common';
import { isRelationalTransaction } from '@/relational/core/datasources/common';
import type {
  BaseRelationalEntity,
  TTableInsert,
  TTableObject,
  TTableSchemaWithId,
} from '@/relational/core/models';
import type { TClass, TNullable } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';
import { getTableColumns } from 'drizzle-orm';
import type {
  IRelationalExtraOptions,
  IRelationalQueryDialect,
  IRelationalQueryExecutor,
  TRelationalConnectorOf,
  TRelationalTransactionOf,
  TRelationalTransactionOptionsOf,
} from '../common';
import { ScopeFilterDenial } from '../common';

/** Relational implementation of `AbstractRepository`: adds the query dialect + hidden-column exclusion on top of the neutral base, and reaches the database only through `IRelationalQueryExecutor`. Both engine-facing parameters default to the neutral SQL contracts; an engine binds them by subclassing. */
export abstract class RelationalBaseRepository<
  EntitySchema extends TTableSchemaWithId = TTableSchemaWithId,
  DataObject extends TTableObject<EntitySchema> = TTableObject<EntitySchema>,
  PersistObject extends TTableInsert<EntitySchema> = TTableInsert<EntitySchema>,
  ExtraOptions extends IExtraOptions = IRelationalExtraOptions,
  TDataSource extends IRelationalDataSource = IRelationalDataSource,
>
  extends AbstractRepository<DataObject, PersistObject, ExtraOptions>
  implements IPersistableRepository<DataObject, PersistObject, ExtraOptions>
{
  /**
   * The `Pick` return type is load-bearing, not decoration. `TWhere<DataObject>` is a homomorphic
   * mapped type over an unresolved type parameter, and TypeScript cannot check a one-key literal
   * against it - `{ id }` fails even though `id` is a real key. `Pick<..., 'id'>` resolves that one
   * key, and the result still assigns to `TWhere<DataObject>` because every key there is optional.
   * Without it every `*ById` method needs a cast, which would hide a genuinely wrong id type.
   */
  protected whereById(opts: { id: DataObject['id'] }): Pick<TWhere<DataObject>, 'id'> {
    return { id: opts.id };
  }

  /** Memoized Set view of the base's `hiddenFields` array - built once on first access. */
  private _hiddenPropertySet: Set<string> | null = null;

  /** Memoized Drizzle column-selection map derived from hidden fields. `null` = not yet computed; `undefined` = computed, no hidden fields. */
  private _visibleColumns: Record<string, unknown> | null | undefined = null;

  constructor(
    dataSource?: TDataSource,
    opts?: {
      scope?: string;
      entityClass?: TClass<BaseRelationalEntity<EntitySchema>>;
      operationScope?: TRepositoryOperationScope;
    },
  ) {
    super(dataSource, opts);
  }

  override get dataSource(): TDataSource {
    return super.dataSource as TDataSource;
  }

  override set dataSource(value: TDataSource) {
    super.dataSource = value;
  }

  override get entity(): BaseRelationalEntity<EntitySchema> {
    return super.entity as BaseRelationalEntity<EntitySchema>;
  }

  override set entity(value: BaseRelationalEntity<EntitySchema>) {
    super.entity = value;
  }

  get queryDialect(): IRelationalQueryDialect {
    return this.dataSource.getQueryDialect();
  }

  /** Every Drizzle call the repository tier makes goes through this port, supplied by the engine branch via the datasource. */
  protected get queryExecutor(): IRelationalQueryExecutor<TRelationalConnectorOf<TDataSource>> {
    return this.dataSource.getQueryExecutor() as IRelationalQueryExecutor<
      TRelationalConnectorOf<TDataSource>
    >;
  }

  get connector(): TRelationalConnectorOf<TDataSource> {
    return this.dataSource.getConnector() as TRelationalConnectorOf<TDataSource>;
  }

  override setDataSource(opts: { dataSource: TDataSource }): void {
    super.setDataSource(opts);
  }

  getEntitySchema(): EntitySchema {
    return this.entity.schema;
  }

  /** Hidden fields as a memoized Set, derived from the base's class-keyed `hiddenFields` array. */
  getHiddenProperties(): Set<string> {
    this._hiddenPropertySet ??= new Set(this.hiddenFields);
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

  /** Same override seam as `getDefaultFilter()` - a repository with no resolvable `@model` entity (a synthetic test double, a hand-built stub) overrides this to avoid touching `modelSettings`/`entity` at all. */
  getScopeFilterSettings(): IScopeFilterSettings | undefined {
    return this.modelSettings?.scopeFilter;
  }

  /**
   * Row scope from `@model` settings.scopeFilter - AND-composed like a default filter, but never
   * skippable via `shouldSkipDefaultFilter`: that flag serves `restore()`'s deliberate reach past
   * soft-delete, which must not also reach past tenant/ownership scoping.
   *
   * `dangerouslySkipScopeFilter` is framework-internal only, never part of `IExtraOptions` and never
   * wire-reachable: it exists so a filter this repository already scoped (find()'s own recursive
   * call) is not scoped a second time, and for explicitly-unscoped administrative code written and
   * reviewed at the repository - never inferable from a request.
   */
  protected applyScopeFilter<DO = any>(opts: {
    userFilter?: TFilter<DO>;
    dangerouslySkipScopeFilter?: boolean;
  }): TFilter<DO> {
    const { userFilter, dangerouslySkipScopeFilter } = opts;

    if (dangerouslySkipScopeFilter) {
      return userFilter ?? {};
    }

    const scopeFilterSettings = this.getScopeFilterSettings();
    if (!scopeFilterSettings) {
      return userFilter ?? {};
    }

    const scopeWhere = scopeFilterSettings.resolve();

    // Checked by exact symbol identity, before the null/undefined branch below: only this literal
    // value can skip scoping. A resolver that forgets a `return` on some branch produces
    // `undefined`, which is NOT this symbol and falls through to `onMissing` (deny by default).
    if (scopeWhere === ScopeFilters.UNRESTRICTED) {
      return userFilter ?? {};
    }

    if (scopeWhere !== null && scopeWhere !== undefined) {
      return this.queryDialect.mergeFilter({ defaultFilter: { where: scopeWhere }, userFilter });
    }

    if (scopeFilterSettings.onMissing === ScopeFilterMissingBehaviors.ALLOW) {
      return userFilter ?? {};
    }

    // 'deny' (default): an unresolved scope means the framework does not know what this caller may
    // see, and the safe reading of "I do not know" is "nothing" - never "everything".
    return this.queryDialect.mergeFilter({
      defaultFilter: { where: ScopeFilterDenial.where<DO>() },
      userFilter,
    });
  }

  /** Merges default filter with user filter. Skippable via shouldSkipDefaultFilter - the row scope from applyScopeFilter is not. */
  applyDefaultFilter<DO = any>(opts: {
    userFilter?: TFilter<DO>;
    shouldSkipDefaultFilter?: boolean;
    dangerouslySkipScopeFilter?: boolean;
  }): TFilter<DO> {
    const { userFilter, shouldSkipDefaultFilter, dangerouslySkipScopeFilter } = opts;

    const scopedFilter = this.applyScopeFilter<DO>({ userFilter, dangerouslySkipScopeFilter });

    if (shouldSkipDefaultFilter) {
      return scopedFilter;
    }

    const defaultFilter = this.getDefaultFilter();
    if (!defaultFilter) {
      return scopedFilter;
    }

    return this.queryDialect.mergeFilter({ defaultFilter, userFilter: scopedFilter });
  }

  async beginTransaction(
    opts?: TRelationalTransactionOptionsOf<TDataSource>,
  ): Promise<TRelationalTransactionOf<TDataSource>> {
    return this.dataSource.beginTransaction(opts) as Promise<TRelationalTransactionOf<TDataSource>>;
  }

  /** Builds Drizzle query options from a filter, excluding hidden properties. */
  buildQuery(opts: { filter: TFilter<DataObject> }): TDrizzleQueryOptions {
    const result = this.queryDialect.build({
      tableName: this.entity.name,
      schema: this.entity.schema,
      filter: opts.filter,
    });

    if (!this.hasHiddenProperties()) {
      return result;
    }

    const hiddenProps = this.getHiddenProperties();

    if (result.columns) {
      result.columns = this.omitHiddenColumns({ columns: result.columns, hiddenProps });
      return result;
    }

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

  /** Copy of a Drizzle column selection with hidden properties dropped. */
  private omitHiddenColumns(opts: {
    columns: Record<string, boolean>;
    hiddenProps: Set<string>;
  }): Record<string, boolean> {
    const { columns, hiddenProps } = opts;
    const filteredColumns: Record<string, boolean> = {};

    for (const key in columns) {
      if (hiddenProps.has(key)) {
        continue;
      }

      filteredColumns[key] = columns[key];
    }

    return filteredColumns;
  }

  /** Resolves the database connector, using the transaction's connector if provided. */
  protected resolveConnector(opts?: {
    transaction?: ITransaction;
  }): TRelationalConnectorOf<TDataSource> {
    const { transaction } = opts ?? {};

    if (!transaction) {
      return this.dataSource.getConnector() as TRelationalConnectorOf<TDataSource>;
    }

    if (!transaction.isActive) {
      throw getError({
        message: `[${this.constructor.name}][resolveConnector] Transaction is no longer active`,
      });
    }

    if (!isRelationalTransaction(transaction)) {
      throw getError({
        message: `[${this.constructor.name}][resolveConnector] Transaction is not a relational transaction`,
      });
    }

    return transaction.connector as TRelationalConnectorOf<TDataSource>;
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
    options: TFindRangeOptions<ExtraOptions, R>;
  }): Promise<{ data: Array<R>; range: TDataRange }>;

  abstract override find<R = DataObject>(opts: {
    filter: TFilter<DataObject>;
    options?: TFindOptions<ExtraOptions, R>;
  }): Promise<R[]>;

  abstract override findOne<R = DataObject>(opts: {
    filter: TFilter<DataObject>;
    options?: TFindOneOptions<ExtraOptions, R>;
  }): Promise<TNullable<R>>;

  abstract override findById<R = DataObject>(opts: {
    id: IdType;
    filter?: Omit<TFilter<DataObject>, 'where'>;
    options?: TFindOneOptions<ExtraOptions, R>;
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

  // Re-declared, not inherited: the base alias is `Array<R> | null` to cover the search family, but SQL engines have RETURNING so this surface must stay exactly `Array<R>`.
  override updateBy(opts: {
    data: Partial<PersistObject>;
    where: TWhere<DataObject>;
    options: ExtraOptions & { shouldReturn: false; force?: boolean };
  }): Promise<TCount & { data: undefined | null }>;
  override updateBy<R = DataObject>(opts: {
    data: Partial<PersistObject>;
    where: TWhere<DataObject>;
    options?: ExtraOptions & { shouldReturn?: true; force?: boolean };
  }): Promise<TCount & { data: Array<R> }>;
  override updateBy<R = DataObject>(opts: {
    data: Partial<PersistObject>;
    where: TWhere<DataObject>;
    options?: ExtraOptions & { shouldReturn?: boolean; force?: boolean };
  }): Promise<TCount & { data: TNullable<Array<R>> }> {
    const { data, where, options } = opts;

    if (options?.shouldReturn === false) {
      return this.updateAll({ data, where, options: { ...options, shouldReturn: false } });
    }

    return this.updateAll<R>({ data, where, options });
  }

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

  // Same rationale as updateBy above: keep this alias surface at `Array<R>`.
  override deleteBy(opts: {
    where?: TWhere<DataObject>;
    options: ExtraOptions & { shouldReturn: false; force?: boolean };
  }): Promise<TCount & { data: undefined | null }>;
  override deleteBy<R = DataObject>(opts: {
    where?: TWhere<DataObject>;
    options?: ExtraOptions & { shouldReturn?: true; force?: boolean };
  }): Promise<TCount & { data: Array<R> }>;
  override deleteBy<R = DataObject>(opts: {
    where?: TWhere<DataObject>;
    options?: ExtraOptions & { shouldReturn?: boolean; force?: boolean };
  }): Promise<TCount & { data: TNullable<Array<R>> }> {
    const { where, options } = opts;

    if (options?.shouldReturn === false) {
      return this.deleteAll({ where, options: { ...options, shouldReturn: false } });
    }

    return this.deleteAll<R>({ where, options });
  }
}
