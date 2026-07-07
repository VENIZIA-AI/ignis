import { getError, TNullable } from '@venizia/ignis-helpers';
import {
  DEFAULT_LIMIT,
  IExtraOptions,
  TCount,
  TDataRange,
  TFilter,
  TWhere,
} from '@/base/repositories/common';
import { IdType } from '@/base/models';
import { ISearchResult } from '../../driver';
import { SearchBaseRepository } from './base';

/** Read-only search-repository tier - translates filters via the datasource's dialect and executes through the driver. */
export class ReadableSearchRepository<
  TDocument extends object = object,
> extends SearchBaseRepository<TDocument> {
  async count(opts: { where: TWhere; options?: IExtraOptions }): Promise<TCount> {
    this.assertNoTransaction(opts.options);
    this.assertNoLock(opts.options);

    const query = this.buildQuery({
      filter: { where: opts.where },
      shouldSkipDefaultFilter: opts.options?.shouldSkipDefaultFilter,
    });

    const result = await this.dataSource.getDriver().search({
      collection: this.collectionName,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Typesense wire field name
      params: { ...query, per_page: 0 },
    });

    return { count: result.found };
  }

  async existsWith(opts: { where: TWhere; options?: IExtraOptions }): Promise<boolean> {
    const { count } = await this.count(opts);
    return count > 0;
  }

  find<R = TDocument>(opts: {
    filter?: TFilter;
    options: IExtraOptions & { shouldQueryRange: true };
  }): Promise<{ data: Array<R>; range: TDataRange }>;

  find<R = TDocument>(opts?: {
    filter?: TFilter;
    options?: IExtraOptions & { shouldQueryRange?: false };
  }): Promise<Array<R>>;

  /** Bare array or `{ data, range }` per shouldQueryRange, postgres-shaped range. Typesense's `found`
   * already comes back in the same call as `hits`, so unlike SQL no second count query is needed. */
  async find<R = TDocument>(opts?: {
    filter?: TFilter;
    options?: IExtraOptions & { shouldQueryRange?: boolean };
  }): Promise<Array<R> | { data: Array<R>; range: TDataRange }> {
    const { filter, options } = opts ?? {};
    this.assertNoTransaction(options);
    this.assertNoLock(options);

    // Omitted limit falls back to @model settings.defaultLimit then DEFAULT_LIMIT, rather than leaving `per_page` unset (an unbounded query).
    const effectiveFilter: TFilter = {
      ...filter,
      limit: filter?.limit ?? this.defaultLimit ?? DEFAULT_LIMIT,
    };

    const query = this.buildQuery({
      filter: effectiveFilter,
      shouldSkipDefaultFilter: options?.shouldSkipDefaultFilter,
    });

    const result = await this.dataSource.getDriver().search<TDocument>({
      collection: this.collectionName,
      params: query,
    });

    const { hits, found } = result;
    // R defaults to TDocument, so this cast is a no-op at the default call sites; an explicit
    // `find<Other>()` call is the caller's own unchecked assertion.
    const data = (hits ?? []).map(hit => hit.document) as any;

    if (!options?.shouldQueryRange) {
      return data;
    }

    const start = effectiveFilter.skip ?? effectiveFilter.offset ?? 0;
    const end = data.length > 0 ? start + data.length - 1 : start;

    return { data, range: { start, end, total: found } };
  }

  async findOne<R = TDocument>(opts?: {
    filter?: TFilter;
    options?: IExtraOptions;
  }): Promise<TNullable<R>> {
    const { filter, options } = opts ?? {};
    const results = await this.find<R>({ filter: { ...filter, limit: 1 }, options });
    return results[0] ?? null;
  }

  /** Delegates to findOne with id in where - routes through buildQuery so hiddenFields/defaultFilter apply (a soft-deleted doc resolves to null, not fetched directly). */
  findById<R = TDocument>(opts: { id: IdType; options?: IExtraOptions }): Promise<TNullable<R>> {
    const { id, options } = opts;
    return this.findOne<R>({ filter: { where: { id } }, options });
  }

  /** Raw passthrough to the driver's search - no dialect translation, no default filter.
   * `TResult` defaults to `ISearchResult<TDocument>`; override it when the engine response is shaped differently (e.g. grouped hits). */
  search<TResult = ISearchResult<TDocument>>(opts: {
    params: object;
    options?: object;
  }): Promise<TResult> {
    const { params, options } = opts;

    // ISearchDriver.search() only declares { collection, params }; concrete backends accept an
    // extra options arg, so build via a typed local to sidestep the excess-property check.
    const searchOpts: { collection: string; params: object; options?: object } = {
      collection: this.collectionName,
      params,
    };

    if (options) {
      searchOpts.options = options;
    }

    return this.dataSource.getDriver().search(searchOpts) as Promise<TResult>;
  }

  /** @throws Error - disabled in a read-only repository; unlocked progressively by Persistable/DefaultSearchRepository. */
  create(opts: {
    data: TDocument;
    options: IExtraOptions & { shouldReturn: false };
  }): Promise<TCount & { data: undefined | null }>;
  create<R = TDocument>(opts: {
    data: TDocument;
    options?: IExtraOptions & { shouldReturn?: true };
  }): Promise<TCount & { data: R }>;
  create<R = TDocument>(_opts: {
    data: TDocument;
    options?: IExtraOptions & { shouldReturn?: boolean };
  }): Promise<TCount & { data: TNullable<R> }> {
    throw getError({
      message: `[${this.create.name}] Repository operation is NOT ALLOWED | scope: ${this.operationScope}`,
    });
  }

  /** @throws Error - disabled in a read-only repository. */
  createAll(opts: {
    data: Array<TDocument>;
    options: IExtraOptions & { shouldReturn: false };
  }): Promise<TCount & { data: undefined | null }>;
  createAll<R = TDocument>(opts: {
    data: Array<TDocument>;
    options?: IExtraOptions & { shouldReturn?: true };
  }): Promise<TCount & { data: Array<R> }>;
  createAll<R = TDocument>(_opts: {
    data: Array<TDocument>;
    options?: IExtraOptions & { shouldReturn?: boolean };
  }): Promise<TCount & { data: TNullable<Array<R>> }> {
    throw getError({
      message: `[${this.createAll.name}] Repository operation is NOT ALLOWED | scope: ${this.operationScope}`,
    });
  }

  /** @throws Error - disabled in a read-only repository. */
  updateById(opts: {
    id: IdType;
    data: Partial<TDocument>;
    options: IExtraOptions & { shouldReturn: false };
  }): Promise<TCount & { data: undefined | null }>;
  updateById<R = TDocument>(opts: {
    id: IdType;
    data: Partial<TDocument>;
    options?: IExtraOptions & { shouldReturn?: true };
  }): Promise<TCount & { data: R }>;
  updateById<R = TDocument>(_opts: {
    id: IdType;
    data: Partial<TDocument>;
    options?: IExtraOptions & { shouldReturn?: boolean };
  }): Promise<TCount & { data: TNullable<R> }> {
    throw getError({
      message: `[${this.updateById.name}] Repository operation is NOT ALLOWED | scope: ${this.operationScope}`,
    });
  }

  /** @throws Error - disabled in a read-only repository. */
  updateAll(opts: {
    data: Partial<TDocument>;
    where?: TWhere;
    options: IExtraOptions & { shouldReturn: false; force?: boolean };
  }): Promise<TCount & { data: undefined | null }>;
  updateAll<R = TDocument>(opts: {
    data: Partial<TDocument>;
    where?: TWhere;
    options?: IExtraOptions & { shouldReturn?: true; force?: boolean };
  }): Promise<TCount & { data: Array<R> }>;
  updateAll<R = TDocument>(_opts: {
    data: Partial<TDocument>;
    where?: TWhere;
    options?: IExtraOptions & { shouldReturn?: boolean; force?: boolean };
  }): Promise<TCount & { data: TNullable<Array<R>> }> {
    throw getError({
      message: `[${this.updateAll.name}] Repository operation is NOT ALLOWED | scope: ${this.operationScope}`,
    });
  }

  /** @throws Error - disabled in a read-only repository. */
  deleteById(opts: {
    id: IdType;
    options: IExtraOptions & { shouldReturn: false };
  }): Promise<TCount & { data: undefined | null }>;
  deleteById<R = TDocument>(opts: {
    id: IdType;
    options?: IExtraOptions & { shouldReturn?: true };
  }): Promise<TCount & { data: R }>;
  deleteById<R = TDocument>(_opts: {
    id: IdType;
    options?: IExtraOptions & { shouldReturn?: boolean };
  }): Promise<TCount & { data: TNullable<R> }> {
    throw getError({
      message: `[${this.deleteById.name}] Repository operation is NOT ALLOWED | scope: ${this.operationScope}`,
    });
  }

  /** @throws Error - disabled in a read-only repository. Unlocked by DefaultSearchRepository. */
  deleteAll(opts: {
    where?: TWhere;
    options: IExtraOptions & { shouldReturn: false; force?: boolean };
  }): Promise<TCount & { data: undefined | null }>;
  deleteAll<R = TDocument>(opts?: {
    where?: TWhere;
    options?: IExtraOptions & { shouldReturn?: true; force?: boolean };
  }): Promise<TCount & { data: Array<R> }>;
  deleteAll<R = TDocument>(_opts?: {
    where?: TWhere;
    options?: IExtraOptions & { shouldReturn?: boolean; force?: boolean };
  }): Promise<TCount & { data: TNullable<Array<R>> }> {
    throw getError({
      message: `[${this.deleteAll.name}] Repository operation is NOT ALLOWED | scope: ${this.operationScope}`,
    });
  }
}
