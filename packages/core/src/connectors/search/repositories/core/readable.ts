import type { TNullable } from '@venizia/ignis-helpers';
import type {
  IExtraOptions,
  TCount,
  TDataWithRange,
  TFilter,
  TFindOneOptions,
  TFindOptions,
  TFindRangeOptions,
  TWhere,
} from '@/base/repositories/common';
import { buildDataRange, DEFAULT_LIMIT } from '@/base/repositories/common';
import type { IdType } from '@/base/models';
import type { ISearchResult } from '@/connectors/search';
import type { TSearchInput } from '@/connectors/search/repositories/common';
import { SearchModes } from '@/connectors/search/repositories/common';
import type { AbstractSearchDataSource } from '@/connectors/search/datasources';
import { SearchBaseRepository } from './base';

/** Read-only search-repository tier - translates filters via the datasource's dialect and executes through the connector. */
export class ReadableSearchRepository<
  TDocument extends object = object,
  TDataSource extends AbstractSearchDataSource = AbstractSearchDataSource,
> extends SearchBaseRepository<TDocument, TDataSource> {
  async count(opts: { where: TWhere; options?: IExtraOptions }): Promise<TCount> {
    this.assertNoTransaction(opts.options);
    this.assertNoLock(opts.options);

    const query = this.buildQuery({
      filter: { where: opts.where },
      shouldSkipDefaultFilter: opts.options?.shouldSkipDefaultFilter,
    });

    // An absorbing where counts zero by definition. Asking the engine would mean sending NO
    // filterBy at all, which counts the entire collection.
    if (query.matchNone) {
      return { count: 0 };
    }

    // Counted through the document endpoint, never search: an engine whose search total is capped
    // or estimated would report a count that quietly lies.
    const count = await this.connector.document.count({
      collection: this.collectionName,
      filterBy: query.filterBy,
    });

    return { count };
  }

  async existsWith(opts: { where: TWhere; options?: IExtraOptions }): Promise<boolean> {
    const { count } = await this.count(opts);
    return count > 0;
  }

  find<R = TDocument>(opts: {
    filter: TFilter;
    options: TFindRangeOptions<IExtraOptions, R>;
  }): Promise<TDataWithRange<R>>;

  find<R = TDocument>(opts: {
    filter: TFilter;
    options?: TFindOptions<IExtraOptions, R>;
  }): Promise<Array<R>>;

  /**
   * Bare array or `{ data, range }` per shouldQueryRange, postgres-shaped range. Typesense returns
   * `found` in the same call as `hits`, so unlike SQL no second count query is needed.
   */
  async find<R = TDocument>(opts: {
    filter: TFilter;
    options?: TFindOptions<IExtraOptions, R> | TFindRangeOptions<IExtraOptions, R>;
  }): Promise<Array<R> | TDataWithRange<R>> {
    const { filter, options } = opts;

    if (options?.retry) {
      return options.shouldQueryRange === true
        ? this.findRangeUntil<R>({ filter, options })
        : this.findUntil<R>({ filter, options });
    }

    this.assertNoTransaction(options);
    this.assertNoLock(options);

    // An omitted limit falls back to @model settings.defaultLimit then DEFAULT_LIMIT - leaving
    // `per_page` unset would be an unbounded query.
    const effectiveFilter: TFilter = {
      ...filter,
      limit: filter?.limit ?? this.defaultLimit ?? DEFAULT_LIMIT,
    };

    const query = this.buildQuery({
      filter: effectiveFilter,
      shouldSkipDefaultFilter: options?.shouldSkipDefaultFilter,
    });

    // No round-trip for an absorbing where: with no filterBy the engine would happily return the
    // whole collection, which is the opposite of what the filter asked for.
    const result = query.matchNone
      ? { hits: [], found: 0 }
      : await this.connector.search<TDocument>({
          collection: this.collectionName,
          params: this.queryDialect.toWireParams({ query }),
        });

    const { hits, found } = result;

    // The cast is the caller's own unchecked assertion when they pass an explicit `find<Other>()`.
    // Hidden fields are stripped in JS too, not only engine-side: Typesense honours
    // `exclude_fields`, Meilisearch has no per-query exclusion at all.
    const data = this.omitHiddenFieldsAll((hits ?? []).map(hit => hit.document)) as any;

    if (!options?.shouldQueryRange) {
      return data;
    }

    return {
      data,
      range: buildDataRange({
        skip: effectiveFilter.skip,
        offset: effectiveFilter.offset,
        dataLength: data.length,
        total: found,
      }),
    };
  }

  async findOne<R = TDocument>(opts: {
    filter: TFilter;
    options?: TFindOneOptions<IExtraOptions, R>;
  }): Promise<TNullable<R>> {
    const { filter, options } = opts;

    if (options?.retry) {
      return this.findOneUntil<R>({ filter, options });
    }

    // `retry` is handled above so it is absent here; TFindOneOptions's retry generic (TNullable<R>)
    // does not unify with find's own (Array<R>), hence the options-only cast.
    const results: Array<R> = await this.find<R>({
      filter: { ...filter, limit: 1 },
      options: options as TFindOptions<IExtraOptions, R>,
    });

    return results[0] ?? null;
  }

  /**
   * Delegates to findOne with id in where - routing through buildQuery is what makes
   * hiddenFields/defaultFilter apply, so a soft-deleted document resolves to null. `where` is spread
   * away last so a projection can never widen the id lookup.
   */
  findById<R = TDocument>(opts: {
    id: IdType;
    filter?: Omit<TFilter, 'where'>;
    options?: TFindOneOptions<IExtraOptions, R>;
  }): Promise<TNullable<R>> {
    const { id, filter, options } = opts;

    return this.findOne<R>({ filter: { ...filter, where: { id } }, options });
  }

  /**
   * Unified search entry discriminated by `mode`: `raw` is a full passthrough - no dialect, no
   * defaultFilter, no hiddenFields - while keyword/semantic/hybrid translate through the dialect
   * like `find()`. Nothing engine-specific lives here; `ISearchQueryDialect.applySearchInput`
   * owns it.
   */
  async search<R extends object = TDocument>(
    opts: TSearchInput & { options?: IExtraOptions },
  ): Promise<ISearchResult<R>> {
    if (opts.mode === SearchModes.RAW) {
      return this.connector.search<R>({
        collection: this.collectionName,
        params: opts.params,
      });
    }

    this.assertNoTransaction(opts.options);
    this.assertNoLock(opts.options);

    const query = this.buildQuery({
      filter: opts.filter,
      shouldSkipDefaultFilter: opts.options?.shouldSkipDefaultFilter,
    });

    this.queryDialect.applySearchInput({ query, input: opts });

    // Same short-circuit as find(): an absorbing filter cannot be expressed to the engine, and
    // omitting it would search everything.
    // `isFoundExact` is true because zero is not an estimate - nothing was searched to approximate.
    if (query.matchNone) {
      return { hits: [], found: 0, isFoundExact: true };
    }

    const result = await this.connector.search<R>({
      collection: this.collectionName,
      params: this.queryDialect.toWireParams({ query }),
    });

    return {
      ...result,
      hits: (result.hits ?? []).map(hit => ({
        ...hit,
        document: this.omitHiddenFields(hit.document),
      })),
    };
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
    return this.denyOperation({ methodName: this.create.name });
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
    return this.denyOperation({ methodName: this.createAll.name });
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
    return this.denyOperation({ methodName: this.updateById.name });
  }

  /**
   * @throws Error - disabled in a read-only repository. `where` is optional where the base contract
   * requires it: the `@model` defaultFilter alone can supply the effective filter, and Persistable
   * refuses the write outright when neither is present.
   */
  updateAll(_opts: {
    data: Partial<TDocument>;
    where?: TWhere;
    options?: Omit<IExtraOptions, 'shouldReturn'> & { force?: boolean };
  }): Promise<TCount & { data: null }> {
    return this.denyOperation({ methodName: this.updateAll.name });
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
    return this.denyOperation({ methodName: this.deleteById.name });
  }

  /** @throws Error - disabled in a read-only repository. Unlocked by DefaultSearchRepository. */
  deleteAll(_opts?: {
    where?: TWhere;
    options?: Omit<IExtraOptions, 'shouldReturn'> & { force?: boolean };
  }): Promise<TCount & { data: null }> {
    return this.denyOperation({ methodName: this.deleteAll.name });
  }
}
