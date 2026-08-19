import type { AbstractDataSource } from '@/base/datasources';
import type { AbstractEntity, IdType } from '@/base/models';
import type { IModelMetadata } from '@/helpers/inversion';
import { MetadataRegistry } from '@/helpers/inversion';
import type { TClass, TNullable } from '@venizia/ignis-helpers/common';
import { BaseHelper, getError } from '@venizia/ignis-helpers/core';
import { resolveValue } from '@venizia/ignis-helpers/common';
import {
  executeWithRetryUntil,
  RetryBackoffStrategies,
  RetryJitterModes,
} from '@venizia/ignis-helpers/core';
import type {
  IExtraOptions,
  IPersistableRepository,
  IWithReadRetry,
  TCount,
  TDataWithRange,
  TFindOneOptions,
  TFindOptions,
  TFindRangeOptions,
  TRepositoryOperationScope,
} from '../common';
import { DEFAULT_MAX_LIMIT, RepositoryErrorCodes, RepositoryOperationScopes } from '../common';
import type { TFilter, TInclusion, TWhere } from '@venizia/ignis-filter';

/**
 * Engine-neutral repository plumbing - lazy dataSource/entity resolution, class-keyed `@model`
 * settings, operation scope. `TOptions` defaults to `IExtraOptions` so connectors can narrow it
 * while staying assignable to this base.
 */
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

  /**
   * Memoized @model settings for `this.entity`'s class. `null` means not yet resolved - `undefined`
   * is itself a valid resolved value: the model declares no settings.
   */
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
    this._entity ??= this.resolveEntity();
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

  /**
   * Resolved `@model` settings for `this.entity`'s class, keyed by Reflect target - not by
   * `entity.name`, which can diverge from the `@model` registry key.
   */
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

  /** Largest `limit` a caller may ask for, when the model declares one; undefined leaves the tier's own default in force. */
  protected get maxLimit(): number | undefined {
    return this.modelSettings?.maxLimit;
  }

  /**
   * Both bounds, in one place, for every tier.
   *
   * The upper bound is the point: `@model({ settings: { maxLimit } })` is public and validated at
   * decoration time, but the relational tier read it nowhere, so `maxLimit: 2` still issued
   * `LIMIT 50000000`.
   *
   * The lower bound matters just as much and is easy to miss: a NEGATIVE limit is not a smaller
   * page. Drizzle renders the LIMIT clause only when the value is `>= 0`, so a negative one removes
   * the clause and returns the whole table. The wire schema now rejects it too, but a server-side
   * caller reaches this method without passing through the schema at all.
   */
  protected assertLimitWithinCeiling(opts: { limit?: number; scope?: string }): void {
    const { limit, scope = 'find' } = opts;

    if (limit === undefined) {
      return;
    }

    // The shape check first, because it needs no metadata at all.
    if (!Number.isInteger(limit) || limit < 0) {
      throw getError({
        message: `[${this.constructor.name}][${scope}] Invalid 'limit' | Expected a non-negative integer | Got: ${limit}`,
      });
    }

    // `maxLimit` reaches `modelSettings`, which resolves the entity - and THAT throws for a
    // repository with no `@repository` model binding. Such a repository is a misconfiguration this
    // method has no business reporting, and the caller path that used to reach `getDefaultLimit()`
    // never touched it either, because `??` short-circuits when a limit is given. So the ceiling is
    // consulted only when the binding that makes it resolvable is actually present.
    const hasModelBinding = Boolean(
      MetadataRegistry.getInstance().getRepositoryBinding({ name: this.constructor.name })?.model,
    );
    const ceiling = (hasModelBinding ? this.maxLimit : undefined) ?? DEFAULT_MAX_LIMIT;

    if (limit > ceiling) {
      throw getError({
        message: `[${this.constructor.name}][${scope}] Requested page exceeds this model's limit | requested: ${limit} | maximum: ${ceiling} | raise it with @model settings.maxLimit if larger pages are genuinely needed`,
      });
    }
  }

  /**
   * The whole filter, relations included. Checking only the top-level `limit` left the identical
   * defect reachable one level down: a relation scope's negative limit drops Drizzle's LIMIT clause
   * for that relation and loads the entire related table.
   *
   * A relation's limit gets the SHAPE check only, not a ceiling. The ceiling belongs to the
   * relation's own model, which this repository cannot resolve - claiming otherwise would enforce
   * the parent's `maxLimit` on a different entity.
   */
  protected assertFilterLimits(opts: { filter?: TFilter; scope?: string }): void {
    const { filter, scope = 'find' } = opts;

    if (!filter) {
      return;
    }

    this.assertLimitWithinCeiling({ limit: filter.limit, scope });

    const walk = (inclusions: TInclusion[] | undefined, path: string): void => {
      for (const inclusion of inclusions ?? []) {
        const relationScope = inclusion.scope;
        if (!relationScope) {
          continue;
        }

        const relationPath = `${path}.${inclusion.relation}`;
        const relationLimit = relationScope.limit;

        if (
          relationLimit !== undefined &&
          (!Number.isInteger(relationLimit) || relationLimit < 0)
        ) {
          throw getError({
            message: `[${this.constructor.name}][${scope}] Invalid 'limit' on relation scope | relation: ${relationPath} | Expected a non-negative integer | Got: ${relationLimit}`,
          });
        }

        walk(relationScope.include, relationPath);
      }
    };

    walk(filter.include, scope);
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

    // resolveValue() erases to the resolved value's structural type, not this class-or-resolver
    // union's member - the `@repository` decorator guarantees a class constructor here.
    const ctor = resolveValue(binding.model) as TClass<AbstractEntity>;
    return new ctor();
  }

  /** Rejects a verb the current operation scope does not permit. */
  protected denyOperation(opts: { methodName: string }): never {
    throw getError({
      messageCode: RepositoryErrorCodes.OPERATION_NOT_ALLOWED,
      message: `[${opts.methodName}] Repository operation is NOT ALLOWED | scope: ${this.operationScope}`,
    });
  }

  /**
   * Shared retry orchestration for read verbs. Inside a transaction retry is skipped - the pool
   * routes transactions to the primary, so there is no replica lag to wait out.
   */
  protected executeReadWithRetry<TResult>(opts: {
    operation: string;
    options: IExtraOptions & IWithReadRetry<TResult>;
    defaultUntil: (result: TResult) => boolean;
    execution: () => Promise<TResult>;
  }): Promise<TResult> {
    const { operation, options, defaultUntil, execution } = opts;

    if (!options.retry) {
      return execution();
    }

    if (options.transaction) {
      this.logger.for(operation).debug('Read retry skipped inside transaction');
      return execution();
    }

    const { maxAttempts, maxTotalMs, signal, backoff, until } = options.retry;

    return executeWithRetryUntil<TResult>({
      operation: [this.constructor.name, operation].join('.'),
      execution,
      until: until ?? defaultUntil,
      maxAttempts,
      maxTotalMs,
      signal,
      backoff: backoff ?? {
        strategy: RetryBackoffStrategies.EXPONENTIAL,
        initialDelayMs: 50,
        maxDelayMs: 500,
        jitter: RetryJitterModes.EQUAL,
      },
      logger: this.logger,
    });
  }

  /**
   * A copy of `options` without `retry`, so re-entering a read verb takes its non-retry path - this
   * is what keeps the retry recursion single-depth. Copy-then-delete rather than a rest-destructure
   * (lint rejects the unused rest sibling) or `lodash/omit` (its `Omit<>` return type is not
   * assignable back to `TOptions`).
   */
  private omitReadRetry<TReadOptions extends { retry?: unknown }>(
    options: TReadOptions,
  ): TReadOptions {
    const rest = { ...options };
    delete rest.retry;
    return rest;
  }

  /** `find`, re-executed until the retry predicate holds - connectors dispatch here from `find` when `options.retry` is set. */
  protected findUntil<R = TDataObject>(opts: {
    filter: TFilter<TDataObject>;
    options: TFindOptions<TOptions, R>;
  }): Promise<Array<R>> {
    const options = this.omitReadRetry(opts.options);

    return this.executeReadWithRetry<Array<R>>({
      operation: 'find',
      options: opts.options,
      defaultUntil: result => result.length > 0,
      execution: () => this.find<R>({ filter: opts.filter, options }),
    });
  }

  /** `find` with the range envelope, re-executed until the retry predicate holds - split from `findUntil` so each result shape is checked against its own `find` overload. */
  protected findRangeUntil<R = TDataObject>(opts: {
    filter: TFilter<TDataObject>;
    options: TFindRangeOptions<TOptions, R>;
  }): Promise<TDataWithRange<R>> {
    const options = this.omitReadRetry(opts.options);

    return this.executeReadWithRetry<TDataWithRange<R>>({
      operation: 'find',
      options: opts.options,
      defaultUntil: result => result.data.length > 0,
      execution: () => this.find<R>({ filter: opts.filter, options }),
    });
  }

  /** `findOne`, re-executed until the retry predicate holds - also serves `findById` via its findOne delegation. */
  protected findOneUntil<R = TDataObject>(opts: {
    filter: TFilter<TDataObject>;
    options: TFindOneOptions<TOptions, R>;
  }): Promise<TNullable<R>> {
    const options = this.omitReadRetry(opts.options);

    return this.executeReadWithRetry<TNullable<R>>({
      operation: 'findOne',
      options: opts.options,
      defaultUntil: result => result !== null && result !== undefined,
      execution: () => this.findOne<R>({ filter: opts.filter, options }),
    });
  }

  abstract count(opts: { where: TWhere<TDataObject>; options?: TOptions }): Promise<TCount>;

  abstract existsWith(opts: { where: TWhere<TDataObject>; options?: TOptions }): Promise<boolean>;

  abstract find<R = TDataObject>(opts: {
    filter: TFilter<TDataObject>;
    options: TFindRangeOptions<TOptions, R>;
  }): Promise<TDataWithRange<R>>;

  abstract find<R = TDataObject>(opts: {
    filter: TFilter<TDataObject>;
    options?: TFindOptions<TOptions, R>;
  }): Promise<R[]>;

  abstract findOne<R = TDataObject>(opts: {
    filter: TFilter<TDataObject>;
    options?: TFindOneOptions<TOptions, R>;
  }): Promise<TNullable<R>>;

  abstract findById<R = TDataObject>(opts: {
    id: IdType;
    filter?: Omit<TFilter<TDataObject>, 'where'>;
    options?: TFindOneOptions<TOptions, R>;
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
  }): Promise<TCount & { data: Array<R> | null }>;

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
  }): Promise<TCount & { data: Array<R> | null }>;
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
  }): Promise<TCount & { data: Array<R> | null }>;

  /** Alias for deleteAll. */
  deleteBy(opts: {
    where: TWhere<TDataObject>;
    options: TOptions & { shouldReturn: false; force?: boolean };
  }): Promise<TCount & { data: undefined | null }>;
  deleteBy<R = TDataObject>(opts: {
    where: TWhere<TDataObject>;
    options?: TOptions & { shouldReturn?: true; force?: boolean };
  }): Promise<TCount & { data: Array<R> | null }>;
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
