import { AbstractDataSource } from '@/base/datasources';
import { AbstractEntity, IdType } from '@/base/models';
import { IModelMetadata, MetadataRegistry } from '@/helpers/inversion';
import { BaseHelper, getError, resolveValue, TClass, TNullable } from '@venizia/ignis-helpers';
import {
    IExtraOptions,
    IPersistableRepository,
    RepositoryOperationScopes,
    TCount,
    TDataRange,
    TFilter,
    TRepositoryOperationScope,
    TWhere,
} from '../common';

/** Engine-neutral repository plumbing - lazy dataSource/entity resolution, class-keyed `@model`
 * settings, operation scope. `TOptions` defaults to `IExtraOptions` so connectors can narrow it while staying assignable to this base. */
export abstract class AbstractRepository<
  TDataObject extends object,
  TPersistObject extends object = TDataObject,
  TOptions extends IExtraOptions = IExtraOptions,
>
  extends BaseHelper
  implements IPersistableRepository<TDataObject, TPersistObject, TOptions>
{
  protected _operationScope: TRepositoryOperationScope;

  /** Lazy-resolved on first access if not provided in constructor. */
  protected _dataSource?: AbstractDataSource;

  /** Lazy-resolved from @repository metadata on first access. */
  protected _entity?: AbstractEntity;

  /** Memoized @model settings for `this.entity`'s class. `null` means "not yet resolved" -
   * `undefined` is itself a valid resolved value (the model declares no settings at all). */
  private _modelSettings: IModelMetadata['settings'] | null = null;

  constructor(
    dataSource?: AbstractDataSource,
    opts?: {
      scope?: string;
      entityClass?: TClass<AbstractEntity>;
      operationScope?: TRepositoryOperationScope;
    },
  ) {
    const scopeName =
      opts?.scope ??
      (opts?.entityClass?.name ? [opts.entityClass.name, 'Repository'].join('') : new.target.name);

    super({ scope: scopeName });

    this._operationScope = opts?.operationScope ?? RepositoryOperationScopes.READ_ONLY;

    if (dataSource) {
      this._dataSource = dataSource;
    }

    if (opts?.entityClass) {
      this._entity = new opts.entityClass();
    }
  }

  get dataSource(): AbstractDataSource {
    if (!this._dataSource) {
      throw getError({
        message: `[${this.constructor.name}] DataSource not available. Use @repository({ model: YourModel, dataSource: YourDataSource }) or pass dataSource in constructor.`,
      });
    }
    return this._dataSource;
  }

  set dataSource(value: AbstractDataSource) {
    this._dataSource = value;
  }

  /** Auto-resolves from @repository metadata if not explicitly set. */
  get entity(): AbstractEntity {
    if (!this._entity) {
      this._entity = this.resolveEntity();
    }
    return this._entity;
  }

  set entity(value: AbstractEntity) {
    this._entity = value;
  }

  get operationScope(): TRepositoryOperationScope {
    return this._operationScope;
  }

  setDataSource(opts: { dataSource: AbstractDataSource }): void {
    this._dataSource = opts.dataSource;
  }

  getEntity(): AbstractEntity {
    return this.entity;
  }

  /** @model settings for `this.entity`'s class, resolved by Reflect target - not by `entity.name`,
   * which can diverge from the `@model` registry key. Memoized after first access. */
  protected get modelSettings(): IModelMetadata['settings'] {
    if (this._modelSettings !== null) {
      return this._modelSettings;
    }

    this._modelSettings = MetadataRegistry.getInstance().getModelMetadata({
      target: this.entity.constructor,
    })?.settings;
    return this._modelSettings;
  }

  protected get hiddenFields(): string[] {
    return this.modelSettings?.hiddenProperties ?? [];
  }

  /** Default where from @model settings.defaultFilter.where, AND-merged into every query unless skipped. */
  protected get defaultWhere(): TWhere | undefined {
    return this.modelSettings?.defaultFilter?.where;
  }

  protected get defaultLimit(): number | undefined {
    return this.modelSettings?.defaultLimit;
  }

  /** Resolves the entity instance from @repository metadata on first access. */
  protected resolveEntity(): AbstractEntity {
    const registry = MetadataRegistry.getInstance();
    const binding = registry.getRepositoryBinding({ name: this.constructor.name });

    if (!binding?.model) {
      throw getError({
        message: `[${this.constructor.name}] Cannot resolve entity. Either pass entityClass in constructor or use @repository decorator with model option.`,
      });
    }

    // binding.model is `TClass<AbstractEntity> | TResolver<TClass<AbstractEntity>>`; resolveValue()
    // is a generic helper that erases to the resolved value's structural type, not this union's
    // member - the `@repository` decorator guarantees it resolves to a class constructor.
    const ctor = resolveValue(binding.model) as TClass<AbstractEntity>;
    return new ctor();
  }

  abstract count(opts: { where: TWhere<TDataObject>; options?: TOptions }): Promise<TCount>;

  abstract existsWith(opts: { where: TWhere<TDataObject>; options?: TOptions }): Promise<boolean>;

  abstract find<R = TDataObject>(opts: {
    filter: TFilter<TDataObject>;
    options: TOptions & { shouldQueryRange: true };
  }): Promise<{ data: Array<R>; range: TDataRange }>;

  abstract find<R = TDataObject>(opts: {
    filter: TFilter<TDataObject>;
    options?: TOptions & { shouldQueryRange?: false };
  }): Promise<R[]>;

  abstract findOne<R = TDataObject>(opts: {
    filter: TFilter<TDataObject>;
    options?: TOptions;
  }): Promise<TNullable<R>>;

  abstract findById<R = TDataObject>(opts: {
    id: IdType;
    filter?: Omit<TFilter<TDataObject>, 'where'>;
    options?: TOptions;
  }): Promise<TNullable<R>>;

  abstract create(opts: {
    data: TPersistObject;
    options: TOptions & { shouldReturn: false };
  }): Promise<TCount & { data: undefined | null }>;

  abstract create<R = TDataObject>(opts: {
    data: TPersistObject;
    options?: TOptions & { shouldReturn?: true };
  }): Promise<TCount & { data: R }>;

  abstract createAll(opts: {
    data: Array<TPersistObject>;
    options: TOptions & { shouldReturn: false };
  }): Promise<TCount & { data: undefined | null }>;

  abstract createAll<R = TDataObject>(opts: {
    data: Array<TPersistObject>;
    options?: TOptions & { shouldReturn?: true };
  }): Promise<TCount & { data: Array<R> }>;

  abstract updateById(opts: {
    id: IdType;
    data: Partial<TPersistObject>;
    options: TOptions & { shouldReturn: false };
  }): Promise<TCount & { data: undefined | null }>;

  abstract updateById<R = TDataObject>(opts: {
    id: IdType;
    data: Partial<TPersistObject>;
    options?: TOptions & { shouldReturn?: true };
  }): Promise<TCount & { data: R }>;

  abstract updateAll(opts: {
    data: Partial<TPersistObject>;
    where: TWhere<TDataObject>;
    options: TOptions & { shouldReturn: false; force?: boolean };
  }): Promise<TCount & { data: undefined | null }>;

  abstract updateAll<R = TDataObject>(opts: {
    data: Partial<TPersistObject>;
    where: TWhere<TDataObject>;
    options?: TOptions & { shouldReturn?: true; force?: boolean };
  }): Promise<TCount & { data: Array<R> }>;

  /** Alias for updateAll. */
  updateBy(opts: {
    data: Partial<TPersistObject>;
    where: TWhere<TDataObject>;
    options: TOptions & { shouldReturn: false; force?: boolean };
  }): Promise<TCount & { data: undefined | null }>;
  updateBy<R = TDataObject>(opts: {
    data: Partial<TPersistObject>;
    where: TWhere<TDataObject>;
    options?: TOptions & { shouldReturn?: true; force?: boolean };
  }): Promise<TCount & { data: Array<R> }>;
  updateBy<R = TDataObject>(opts: {
    data: Partial<TPersistObject>;
    where: TWhere<TDataObject>;
    options?: TOptions & { shouldReturn?: boolean; force?: boolean };
  }): Promise<TCount & { data: TNullable<Array<R>> }> {
    const { data, where, options } = opts;

    if (options?.shouldReturn === false) {
      return this.updateAll({ data, where, options: { ...options, shouldReturn: false } });
    }

    return this.updateAll<R>({ data, where, options });
  }

  abstract deleteById(opts: {
    id: IdType;
    options: TOptions & { shouldReturn: false };
  }): Promise<TCount & { data: undefined | null }>;

  abstract deleteById<R = TDataObject>(opts: {
    id: IdType;
    options?: TOptions & { shouldReturn?: true };
  }): Promise<TCount & { data: R }>;

  abstract deleteAll(opts: {
    where?: TWhere<TDataObject>;
    options: TOptions & { shouldReturn: false; force?: boolean };
  }): Promise<TCount & { data: undefined | null }>;

  abstract deleteAll<R = TDataObject>(opts: {
    where?: TWhere<TDataObject>;
    options?: TOptions & { shouldReturn?: true; force?: boolean };
  }): Promise<TCount & { data: Array<R> }>;

  /** Alias for deleteAll. */
  deleteBy(opts: {
    where: TWhere<TDataObject>;
    options: TOptions & { shouldReturn: false; force?: boolean };
  }): Promise<TCount & { data: undefined | null }>;
  deleteBy<R = TDataObject>(opts: {
    where: TWhere<TDataObject>;
    options?: TOptions & { shouldReturn?: true; force?: boolean };
  }): Promise<TCount & { data: Array<R> }>;
  deleteBy<R = TDataObject>(opts: {
    where: TWhere<TDataObject>;
    options?: TOptions & { shouldReturn?: boolean; force?: boolean };
  }): Promise<TCount & { data: TNullable<Array<R>> }> {
    const { where, options } = opts;

    if (options?.shouldReturn === false) {
      return this.deleteAll({ where, options: { ...options, shouldReturn: false } });
    }

    return this.deleteAll<R>({ where, options });
  }
}
